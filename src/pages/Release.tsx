import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { invalidateCycle, useRelease } from "../api/queries";
import type { ReleaseCard } from "../api/types";
import { useChatContext } from "../app/session";
import { errorText } from "../lib/errors";
import { dateTime, relativeTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Loading, Modal, useToast } from "../components/ui";
import { AgentMark, Dot, KeyLink, KeyList, Lane, ReleaseStatusBadge, type LaneItem } from "../components/cycle";
import { PRRow } from "./feature/Implementation";
import { BlockedBanner } from "../components/BlockedBanner";

export function ReleasePage() {
  const { t } = useTranslation();
  const { key = "" } = useParams();
  const rel = useRelease(key);
  const chat = useChatContext();
  const r = rel.data;
  const { setSubject } = chat;
  const rkey = r?.key;
  const rtitle = r?.featureTitle;
  useEffect(() => {
    if (rkey && rtitle !== undefined) setSubject({ type: "release", key: rkey, title: rtitle });
  }, [rkey, rtitle, setSubject]);
  if (rel.isLoading) return <main className="main"><Loading /></main>;
  if (!r) {
    return (
      <main className="main">
        <Empty icon="alert" title={t("release.notFound", { key })}>
          <div className="acts"><Link className="btn sm" to="/delivery">{t("stages.delivery")}</Link></div>
        </Empty>
      </main>
    );
  }
  return <ReleaseView r={r} />;
}

/** Steps of a release (design spec §1): merge, deploy, flags, metric, confirmation. */
function steps(r: ReleaseCard, t: (k: string) => string): LaneItem[] {
  const order = ["merging", "deploying", "enabling_flags", "evaluating", "awaiting_confirmation"];
  let idx = order.indexOf(r.status);
  if (r.status === "succeeded") idx = order.length;
  if (r.status === "rolling_back" || r.status === "rolled_back") idx = order.indexOf(r.step === "awaiting_confirmation" ? "awaiting_confirmation" : r.step.startsWith("deploy") ? "deploying" : "merging");
  return order.map((s, i) => ({
    key: s,
    label: t(`releaseStep.${s}`),
    sub: s === "enabling_flags" && !r.flagsEnabled ? t("release.skipped") : s === "evaluating" ? t("release.nextRelease") : `${i + 1}`,
    state: r.blocked && i === idx ? "failed" : i < idx ? "done" : i === idx ? "now" : "later",
  }));
}

type Dialog = "confirm" | "rollback" | "plan" | { mark: string } | "flag" | null;

function ReleaseView({ r }: { r: ReleaseCard }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const act = useMutation({
    mutationFn: (path: string) => api.post(`/api/v1/releases/${r.key}${path}`),
    onSuccess: () => invalidateCycle(qc),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const p = r.permissions;
  const finished = r.status === "succeeded" || r.status === "rolled_back";
  const servicePRs = r.prs.filter((x) => x.kind === "service");
  const specPR = r.prs.find((x) => x.kind === "spec");
  const reverts = r.prs.filter((x) => x.kind === "revert");
  return (
    <main className="main">
      <div className="crumbs">
        <Link to="/delivery" aria-label={t("common.back")}><Icon name="back" size={16} /></Link>
        {r.domain} / <KeyLink k={r.key} plain />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <h1 className="ftitle grow" style={{ margin: 0 }}>{r.featureTitle}</h1>
        <ReleaseStatusBadge status={r.status} blocked={r.blocked} />
        {p.rollback && !finished && r.status !== "rolling_back" && (
          <button className="btn sm danger" onClick={() => setDialog("rollback")}><Icon name="undo" size={14} />{t("release.rollback")}</button>
        )}
        {p.confirm && <button className="btn primary sm" onClick={() => setDialog("confirm")}><Icon name="check" size={14} />{t("release.confirm")}</button>}
      </div>
      <div className="meta">
        <span>{t("release.feature")} <KeyLink k={r.feature} /></span>
        {r.issues.length > 0 && <span>{t("feature.issues")} <KeyList keys={r.issues} /></span>}
        <span className="muted">{relativeTime(r.createdAt, i18n.language)}</span>
        {(r.tokensIn + r.tokensOut) > 0 && <span className="muted">{t("common.tokens", { n: (r.tokensIn + r.tokensOut).toLocaleString(i18n.language) })}</span>}
      </div>

      <Lane items={steps(r, t)} />

      {r.blocked && (
        <BlockedBanner title={<b>{t("release.blockedTitle")}</b>} reason={r.blockedReason}>
          {p.retry && <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate("/retry")}>{t("release.retry")}</button>}
        </BlockedBanner>
      )}
      {r.status === "rolling_back" && (
        <div className="banner warn"><Icon name="undo" /><span className="grow"><b>{t("release.rollingBack")}</b> {r.rollbackReason} {r.rollback ? `· ${t(`rollbackStep.${r.rollback.step || "revert"}`, { defaultValue: r.rollback.step })}` : ""}</span>
          {r.rollback?.step === "flags_wait" && p.markFlag && <button className="btn sm" onClick={() => setDialog("flag")}>{t("release.markFlagOff")}</button>}
        </div>
      )}
      {r.status === "rolled_back" && (
        <div className="banner warn"><Icon name="undo" /><span className="grow"><b>{t("release.rolledBack", { name: r.rolledBackBy ?? "" })}</b> {r.rollbackReason}</span></div>
      )}
      {r.status === "succeeded" && (
        <div className="banner ok"><Icon name="check" /><span className="grow">{t("release.succeeded", { name: r.confirmedBy ?? "", at: r.confirmedAt ? dateTime(r.confirmedAt, i18n.language) : "" })}</span></div>
      )}
      {r.step === "awaiting_start" && p.startMerge && (
        <div className="banner info"><Icon name="merge" />
          <span className="grow">{t("release.startHint")}</span>
          <button className="btn sm" onClick={() => setDialog("plan")}>{t("release.editPlan")}</button>
          <button className="btn primary sm" disabled={act.isPending} onClick={() => act.mutate("/merge")}>{t("release.startMerge")}</button>
        </div>
      )}
      {r.step === "flags_wait" && p.markFlag && (
        <div className="banner info"><Icon name="flag" /><span className="grow">{t("release.flagWait", { flag: r.flagKey ?? "" })}</span>
          <button className="btn sm" onClick={() => setDialog("flag")}>{t("release.markFlagOn")}</button>
        </div>
      )}

      <div className="two-col">
        <section>
          <h3 className="group-h">{t("release.prs")}</h3>
          {servicePRs.map((pr, i) => (
            <div key={pr.id} className="svc">
              <div className="h"><span className="count">{i + 1}</span><b>{pr.service}</b>
                {r.currentService === pr.service && !finished && <span className="st disc">{t("release.current")}</span>}
              </div>
              <PRRow pr={pr} />
              <DeployRows r={r} service={pr.service ?? ""} onMark={() => setDialog({ mark: pr.service ?? "" })} />
            </div>
          ))}
          {specPR && (
            <div className="svc">
              <div className="h"><span className="count">{servicePRs.length + 1}</span><b>{t("release.specPr")}</b><span className="small muted">{t("release.onConfirm")}</span></div>
              <PRRow pr={specPR} />
            </div>
          )}
          {reverts.length > 0 && (
            <>
              <h3 className="group-h">{t("release.reverts")}</h3>
              {reverts.map((pr) => <div key={pr.id} className="svc"><PRRow pr={pr} /></div>)}
            </>
          )}
        </section>
        <section>
          <h3 className="group-h">{t("release.metric")}</h3>
          <div className="chartbox">
            {r.metric ? (
              <>
                <div className="small"><Icon name="target" size={14} /> {r.metric.target} · {r.metric.window} · {r.metric.source}</div>
                <div className="mono small t2" style={{ margin: "6px 0" }}>{r.metric.query}</div>
                <p className="small muted" style={{ margin: 0 }}>{t("release.metricNext")}</p>
              </>
            ) : <p className="small muted" style={{ margin: 0 }}>{t("release.noMetric")}</p>}
          </div>
          {r.flagsEnabled && (
            <div className="chartbox" style={{ marginTop: 10 }}>
              <div className="small"><Icon name="flag" size={14} /> {r.flagKey ?? t("release.noFlag")}</div>
              {r.flagState && <div className="small"><Dot tone={r.flagState === "on" ? "g" : "n"} />{t(`release.flag.${r.flagState}`)}</div>}
            </div>
          )}
          {r.tasks.length > 0 && (
            <>
              <h3 className="group-h">{t("release.tasks")}</h3>
              {r.tasks.map((x) => (
                <div key={x.id} className="small row"><AgentMark /> {t(`task.type.${x.type}`)} · {x.service} · {t(`task.status.${x.status}`)}{x.error ? ` — ${x.error}` : ""}</div>
              ))}
            </>
          )}
        </section>
      </div>

      {dialog === "confirm" && <ConfirmModal r={r} onClose={() => setDialog(null)} />}
      {dialog === "rollback" && <RollbackModal r={r} onClose={() => setDialog(null)} />}
      {dialog === "plan" && <PlanModal r={r} onClose={() => setDialog(null)} />}
      {dialog === "flag" && <FlagMarkModal r={r} state={r.status === "rolling_back" ? "off" : "on"} onClose={() => setDialog(null)} />}
      {typeof dialog === "object" && dialog && "mark" in dialog && <MarkModal r={r} service={dialog.mark} onClose={() => setDialog(null)} />}
    </main>
  );
}

function DeployRows({ r, service, onMark }: { r: ReleaseCard; service: string; onMark: () => void }) {
  const { t } = useTranslation();
  const runs = r.deploys.filter((d) => d.service === service);
  const open = runs.length > 0 && !["success"].includes(runs[runs.length - 1].status);
  return (
    <>
      {runs.map((d) => (
        <div key={d.id} className="pr">
          <Icon name={d.isRollback ? "undo" : "rocket"} size={15} />
          <span className="small">{t(`deploy.status.${d.status}`)}{d.signal ? ` · ${t(`deploy.signal.${d.signal}`)}` : ""}{d.version ? ` · ${d.version}` : ""}{d.markedBy ? ` · ${d.markedBy}` : ""}</span>
          <span>{d.runUrl && <a className="small" href={d.runUrl} target="_blank" rel="noreferrer">{t("deploy.run")}</a>}</span>
          <span />
        </div>
      ))}
      {open && r.permissions.markDeploy && (
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn sm" onClick={onMark}>{t("release.markDeploy")}</button></div>
      )}
    </>
  );
}

function ConfirmModal({ r, onClose }: { r: ReleaseCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/releases/${r.key}/confirm`),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("release.confirmTitle", { key: r.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={go.isPending} onClick={() => go.mutate()}>{t("release.confirm")}</button>
      </>
    }>
      <ul className="small t2" style={{ marginTop: 0 }}>
        <li>{t("release.confirmSpec")}</li>
        <li>{t("release.confirmStatuses")}</li>
      </ul>
      {r.metricResult === "not_achieved" && <div className="banner warn">{t("release.confirmProblem")}</div>}
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function RollbackModal({ r, onClose }: { r: ReleaseCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/releases/${r.key}/rollback`, { reason }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("rollback.title", { key: r.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn danger-fill" disabled={!reason.trim() || go.isPending} onClick={() => go.mutate()}><Icon name="undo" size={14} />{t("release.rollback")}</button>
      </>
    }>
      <p className="small t2" style={{ marginTop: 0 }}>{t("rollback.what")}</p>
      <ol className="small t2">
        <li>{t("rollback.reverts")}</li>
        <li>{t("rollback.redeploy")}</li>
        <li>{t("rollback.flags")}</li>
        <li>{t("rollback.spec")}</li>
        <li>{t("rollback.issues")}</li>
      </ol>
      <div className="field">
        <label htmlFor="rb-reason">{t("rollback.reason")}</label>
        <textarea id="rb-reason" className="inp" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function PlanModal({ r, onClose }: { r: ReleaseCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [order, setOrder] = useState(r.plan.order);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const go = useMutation({
    mutationFn: () => api.put(`/api/v1/releases/${r.key}/plan`, { order }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("release.editPlan")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={go.isPending} onClick={() => go.mutate()}>{t("common.save")}</button>
      </>
    }>
      <p className="small t2" style={{ marginTop: 0 }}>{t("release.planHint")}</p>
      {order.map((s, i) => (
        <div key={s} className="row" style={{ marginBottom: 6 }}>
          <span className="count">{i + 1}</span><b className="grow">{s}</b>
          <button className="btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("release.up")}>↑</button>
          <button className="btn sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t("release.down")}>↓</button>
        </div>
      ))}
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function MarkModal({ r, service, onClose }: { r: ReleaseCard; service: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [version, setVersion] = useState("");
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/releases/${r.key}/deploys/${service}/mark`, { version }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("release.markTitle", { service })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={go.isPending} onClick={() => go.mutate()}>{t("release.markDeploy")}</button>
      </>
    }>
      <div className="field">
        <label htmlFor="mk-version">{t("release.version")}</label>
        <input id="mk-version" className="inp mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v3.2.0" />
        <div className="hint">{t("release.markHint")}</div>
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function FlagMarkModal({ r, state, onClose }: { r: ReleaseCard; state: "on" | "off"; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/releases/${r.key}/flag/mark`, { state, at: new Date().toISOString() }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t(state === "on" ? "release.markFlagOn" : "release.markFlagOff")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={go.isPending} onClick={() => go.mutate()}>{t("common.save")}</button>
      </>
    }>
      <p className="small t2" style={{ marginTop: 0 }}>{t("release.flagMarkHint", { flag: r.flagKey ?? "" })}</p>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}
