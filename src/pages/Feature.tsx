import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { invalidateFeature, keys, useFeature } from "../api/queries";
import { AREAS, type Area, type CodegenPlan, type FeatureCard, type Gate, type HistoryItem, type List } from "../api/types";
import { useChatContext } from "../app/session";
import { DocumentPane } from "../editor/DocumentPane";
import { errorText } from "../lib/errors";
import { dateTime, relativeTime, shortSha } from "../lib/format";
import { Icon } from "../components/Icon";
import { Avatar, Empty, Loading, Modal, StatusBadge, useOutside, useToast } from "../components/ui";
import { AgentMark, KeyList, Lane, PhaseBadge, type LaneItem } from "../components/cycle";
import { ImplementationTab } from "./feature/Implementation";
import { ValidationTab } from "./feature/Validation";
import { ActivityTab } from "./feature/Activity";
import { BlockedBanner } from "../components/BlockedBanner";

const TABS = ["spec", "implementation", "validation", "history"] as const;
type Tab = (typeof TABS)[number];

export function FeaturePage() {
  const { t } = useTranslation();
  const { uniqueId = "", tab: tabParam, area: areaParam } = useParams();
  const feature = useFeature(uniqueId);
  const chat = useChatContext();
  const f = feature.data;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "spec";
  const area = (areaParam && AREAS.includes(areaParam as Area) ? areaParam : f?.gates[0]?.area) as Area | undefined;

  // Opening a feature switches the chat to it (tech spec §7).
  const { setSubject } = chat;
  const fid = f?.uniqueId;
  const ftitle = f?.title;
  useEffect(() => {
    if (fid && ftitle !== undefined) setSubject({ type: "feature", key: fid, title: ftitle }, tab === "spec" ? area ?? null : null);
  }, [fid, ftitle, area, tab, setSubject]);

  if (feature.isLoading) return <main className="main"><Loading /></main>;
  if (feature.error instanceof ApiError && feature.error.status === 410) return <DeletedFeature error={feature.error} />;
  if (feature.error || !f) {
    return (
      <main className="main">
        <Empty icon="alert" title={t("feature.notFound", { id: uniqueId })}>
          <div className="acts"><Link className="btn sm" to="/development">{t("stages.development")}</Link></div>
        </Empty>
      </main>
    );
  }
  return <FeatureView f={f} tab={tab} area={area} />;
}

function DeletedFeature({ error }: { error: ApiError }) {
  const { t, i18n } = useTranslation();
  const at = error.details.deletedAt ? dateTime(String(error.details.deletedAt), i18n.language) : "";
  return (
    <main className="main">
      <div className="empty" style={{ padding: "70px 20px" }}>
        <div className="ic"><Icon name="trash" /></div>
        <b>{t("feature.deletedTitle", { id: String(error.details.uniqueId ?? "") })}</b>
        {t("feature.deletedText", { name: String(error.details.deletedBy ?? "—"), at })}
        <div className="acts"><Link className="btn sm" to="/development">{t("stages.development")}</Link></div>
      </div>
    </main>
  );
}

/** Path of a feature (design spec §1): Specification, Code generation, Validation, Release. */
export function featureLane(f: FeatureCard, t: (k: string) => string): LaneItem[] {
  const order = ["spec", "codegen", "validation", "in_release"];
  const idx = f.phase === "released" ? 4 : f.phase === "rolled_back" ? 3 : order.indexOf(f.phase);
  return order.map((p, i) => ({
    key: p,
    label: t(`path.${p}`),
    sub: `${i + 1}`,
    state: f.phase === "rolled_back" && i === 3 ? "failed" : i < idx ? "done" : i === idx ? "now" : "later",
  }));
}

type Dialog =
  | { kind: "history"; area: Area }
  | { kind: "deleteGate"; area: Area }
  | { kind: "deleteFeature" }
  | { kind: "codegen" }
  | { kind: "unnumbered"; area: Area; list: string[] }
  | { kind: "flag" }
  | null;

function FeatureView({ f, tab, area }: { f: FeatureCard; tab: Tab; area?: Area }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const chat = useChatContext();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useOutside<HTMLDivElement>(menu, () => setMenu(false));
  const gate = f.gates.find((g) => g.area === area);
  const specPhase = f.phase === "spec";

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => api.post(`/api/v1/features/${f.uniqueId}${path}`, body),
    onSuccess: () => invalidateFeature(qc, f.uniqueId),
    onError: (e) => {
      if (e instanceof ApiError && e.code === "requirements_without_id" && area) {
        setDialog({ kind: "unnumbered", area, list: (e.details.requirements as string[]) ?? [] });
        return;
      }
      toast({ kind: "error", title: errorText(t, e) });
    },
  });
  const addGate = (a: Area) =>
    act.mutate({ path: "/gates", body: { area: a } }, { onSuccess: () => navigate(`/features/${f.uniqueId}/spec/${a}`) });

  const tabLink = (x: Tab) => (x === "spec" ? `/features/${f.uniqueId}` : `/features/${f.uniqueId}/${x}`);
  const generating = f.workflow && f.workflow.kind === "gate_generation" && !["done", "cancelled", "failed"].includes(f.workflow.state);

  return (
    <main className="main">
      <div className="crumbs">
        <Link to="/development" aria-label={t("common.back")}><Icon name="back" size={16} /></Link>
        {f.domain} / {f.system} / <span className="fid">{f.uniqueId}</span>
        {f.parent && <span className="tag-fix">fix</span>}
        {f.isProblem && <span className="ty problem">{t("issueType.problem")}</span>}
        {f.imported && <span className="tag-fix">{t("development.imported")}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <h1 className="ftitle" style={{ flex: 1 }}>{f.title}</h1>
        <PhaseBadge phase={f.phase} />
        {(f.permissions.delete || f.permissions.setFlag) && (
          <div style={{ position: "relative" }} ref={menuRef}>
            <button className="iconbtn" aria-label={t("feature.actions")} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <Icon name="dots" />
            </button>
            {menu && (
              <div className="pop" style={{ right: 0, top: 38 }}>
                {f.permissions.setFlag && (
                  <button onClick={() => { setMenu(false); setDialog({ kind: "flag" }); }}><Icon name="flag" size={16} />{t("feature.flagKey")}</button>
                )}
                {f.permissions.delete && (
                  <button className="danger" onClick={() => { setMenu(false); setDialog({ kind: "deleteFeature" }); }}>
                    <Icon name="trash" size={16} />{t("feature.deleteFeature")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="meta">
        {f.issues.length > 0 ? <span>{t("feature.issues")} <KeyList keys={f.issues} /></span> : f.imported ? <span className="muted">{t("feature.noDiscovery")}</span> : null}
        {f.release && <span>{t("feature.release")} <KeyList keys={[f.release]} /></span>}
        <a href={f.pr.url} target="_blank" rel="noreferrer"><Icon name="branch" size={14} />{t("feature.pr", { n: f.pr.number })}</a>
        {f.phase !== "released" && <span className="small muted">{t("feature.prNotMerged")}</span>}
        {f.metric && <span title={f.metric.query}><Icon name="target" size={14} /> {f.metric.target} · {f.metric.window}</span>}
        {f.flagKey && <span className="mono small"><Icon name="flag" size={12} /> {f.flagKey}</span>}
        {f.parent && <span>{t("feature.fixOf")} <Link to={`/features/${f.parent}`}>{f.parent}</Link></span>}
        <span className="muted">{t("feature.createdBy", { name: f.createdBy, when: relativeTime(f.createdAt, i18n.language) })}</span>
      </div>

      <Lane items={featureLane(f, t)} />

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <NavLink key={x} to={tabLink(x)} end={x === "spec"} className={() => (tab === x ? "on" : "")}>{t(`feature.tabs.${x}`)}</NavLink>
        ))}
      </div>

      {tab === "implementation" && <ImplementationTab f={f} />}
      {tab === "validation" && <ValidationTab f={f} />}
      {tab === "history" && <ActivityTab f={f} />}
      {tab === "spec" && (
        <>
          {f.phase === "codegen" && <div className="banner info"><Icon name="lock" /><span className="grow">{t("feature.readOnlyCodegen")}</span></div>}
          {f.phase === "rolled_back" && <div className="banner warn"><Icon name="undo" /><span className="grow">{t("feature.rolledBack")}</span></div>}
          {f.phase === "indexed" && (
            <div className="banner info"><Icon name="refresh" /><span className="grow">{t("feature.indexedHint")}</span>
              <Link className="btn sm" to={`/spec/${f.uniqueId}/product`}>{t("feature.openInNavigator")}</Link>
            </div>
          )}
          {generating && <div className="banner info"><span className="ring" /><span className="grow">{t("feature.generating")}</span></div>}
          {f.workflow?.kind === "gate_generation" && f.workflow.state === "blocked" && (
            <BlockedBanner title={t("feature.generationFailed")} reason={f.workflow.lastError}>
              {f.permissions.regenerate && <button className="btn sm" onClick={() => act.mutate({ path: "/gates/tech/regenerate" })}>{t("feature.regenerate")}</button>}
            </BlockedBanner>
          )}

          <GateStrip f={f} current={area} onDialog={setDialog} onAdd={addGate} busy={act.isPending} />

          {specPhase && f.permissions.codegen && (
            <div className="banner ok">
              <Icon name="code" />
              <span className="grow"><b>{t("feature.readyForCodegen")}</b> {t("feature.readyForCodegenHint")}</span>
              <button className="btn primary sm" onClick={() => setDialog({ kind: "codegen" })}>{t("feature.startCodegen")}</button>
            </div>
          )}

          {gate && (
            <ActionBar f={f} gate={gate}
              onSubmit={() => act.mutate({ path: `/gates/${gate.area}/submit` }, { onSuccess: () => toast({ kind: "ok", title: t("feature.submitted") }) })}
              onApprove={() => act.mutate({ path: `/gates/${gate.area}/approve` }, { onSuccess: () => toast({ kind: "ok", title: t("feature.approved") }) })}
              onRegenerate={() => act.mutate({ path: `/gates/${gate.area}/regenerate` }, { onSuccess: () => toast({ kind: "ok", title: t("feature.regenerating") }) })}
              onHistory={() => setDialog({ kind: "history", area: gate.area })}
              busy={act.isPending} />
          )}
          {area && gate ? <DocumentPane key={`${f.uniqueId}-${area}`} feature={f} area={area} /> : (
            <Empty icon="files" title={t("feature.noGate")} />
          )}
        </>
      )}

      {dialog?.kind === "history" && <HistoryModal f={f} area={dialog.area} onClose={() => setDialog(null)} />}
      {dialog?.kind === "deleteGate" && <DeleteGateModal f={f} area={dialog.area} onClose={() => setDialog(null)} />}
      {dialog?.kind === "deleteFeature" && <DeleteFeatureModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "codegen" && <CodegenModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "flag" && <FlagModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "unnumbered" && (
        <Modal title={t("unnumbered.title")} onClose={() => setDialog(null)} footer={
          <>
            <button className="btn ghost" onClick={() => {
              setDialog(null);
              chat.send(t("unnumbered.prompt"));
            }}>{t("unnumbered.askAgent")}</button>
            <button className="btn primary" onClick={() => {
              const a = dialog.area;
              setDialog(null);
              act.mutate({ path: `/gates/${a}/submit`, body: { force: true } }, { onSuccess: () => toast({ kind: "ok", title: t("feature.submitted") }) });
            }}>{t("unnumbered.submitAnyway")}</button>
          </>
        }>
          <p className="t2" style={{ marginTop: 0 }}>{t("unnumbered.text", { count: dialog.list.length })}</p>
          <ul className="small">{dialog.list.map((x) => <li key={x}>{x}</li>)}</ul>
        </Modal>
      )}
    </main>
  );
}

// ─── Gate strip ────────────────────────────────────────────────────

function GateStrip({ f, current, onDialog, onAdd, busy }: {
  f: FeatureCard; current?: Area; onDialog: (d: Dialog) => void; onAdd: (a: Area) => void; busy: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuFor, setMenuFor] = useState<Area | null>(null);
  const ref = useOutside<HTMLOListElement>(menuFor !== null, () => setMenuFor(null));
  const byArea = new Map(f.gates.map((g) => [g.area, g]));
  let n = 0;
  return (
    <ol className="gates" ref={ref} aria-label={t("feature.gates")}>
      {AREAS.map((a) => {
        const g = byArea.get(a);
        if (!g) {
          if (f.pendingGates.includes(a)) {
            n++;
            return (
              <li key={a} className="final off">
                <div className="n">{n} · <AgentMark /></div>
                <div className="a">{t(`areas.${a}`)}</div>
                <span className="small muted">{t("feature.generatedLater")}</span>
              </li>
            );
          }
          if (!f.permissions.addGate.includes(a)) return null;
          return (
            <li key={a} className="add">
              <button className="btn ghost sm" style={{ width: "100%", height: "100%" }} disabled={busy} onClick={() => onAdd(a)}>
                <Icon name="plus" size={14} />{t(`areas.${a}`)}
              </button>
            </li>
          );
        }
        n++;
        return (
          <li key={a} className={`pick${current === a ? " cur" : ""}`} onClick={() => navigate(`/features/${f.uniqueId}/spec/${a}`)}
            aria-current={current === a ? "step" : undefined}>
            <div className="n">{n}{g.generated && <> · <AgentMark /></>}</div>
            <div className="a">{t(`areas.${a}`)}</div>
            <StatusBadge status={g.status} approvalRequired={f.approvalRequired} />
            <button className="iconbtn more" aria-label={t("feature.gateActions", { area: t(`areas.${a}`) })}
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === a ? null : a); }}>
              <Icon name="dots" size={15} />
            </button>
            {menuFor === a && (
              <div className="pop" style={{ top: 36, right: 0 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuFor(null); onDialog({ kind: "history", area: a }); }}>{t("feature.history")}</button>
                <Link to={`/features/${f.uniqueId}/spec/${a}/diff`} onClick={() => setMenuFor(null)}>{t("feature.changes")}</Link>
                {f.permissions.deleteGate.includes(a) && (
                  <button className="danger" onClick={() => { setMenuFor(null); onDialog({ kind: "deleteGate", area: a }); }}>
                    <Icon name="trash" size={16} />{t("feature.deleteSpec")}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Action bar ────────────────────────────────────────────────────

function ActionBar({ f, gate, onSubmit, onApprove, onRegenerate, onHistory, busy }: {
  f: FeatureCard; gate: Gate; onSubmit: () => void; onApprove: () => void; onRegenerate: () => void; onHistory: () => void; busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const canSubmit = f.permissions.submit.includes(gate.area);
  const canApprove = f.permissions.approve.includes(gate.area);
  let text: React.ReactNode;
  if (!f.approvalRequired) text = t("feature.bar.noApproval");
  else if (gate.status === "in_review") text = t("feature.bar.inReview", { when: gate.submittedAt ? relativeTime(gate.submittedAt, i18n.language) : "" });
  else if (gate.status === "approved") text = t("feature.bar.approved", { name: gate.approvedBy ?? "", when: gate.approvedAt ? relativeTime(gate.approvedAt, i18n.language) : "" });
  else if (gate.approvedCommit) text = t("feature.bar.draftAfterApproval");
  else text = t("feature.bar.draft");
  return (
    <div className="actionbar">
      <StatusBadge status={gate.status} approvalRequired={f.approvalRequired} />
      <span className="grow">{text}</span>
      <Link className="btn sm" to={`/features/${f.uniqueId}/spec/${gate.area}/diff`}>{t("feature.viewChanges")}</Link>
      <button className="btn sm" onClick={onHistory}>{t("feature.history")}</button>
      {gate.generated && f.permissions.regenerate && <button className="btn sm" disabled={busy} onClick={onRegenerate}><Icon name="refresh" size={14} />{t("feature.regenerate")}</button>}
      {canSubmit && <button className="btn primary sm" disabled={busy} onClick={onSubmit}>{t("feature.submit")}</button>}
      {canApprove && <button className="btn ok sm" disabled={busy} onClick={onApprove}><Icon name="check" size={15} />{t("feature.approve")}</button>}
    </div>
  );
}

// ─── Dialogs ───────────────────────────────────────────────────────

function CodegenModal({ f, onClose }: { f: FeatureCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const start = useMutation({
    mutationFn: () => api.post<CodegenPlan>(`/api/v1/features/${f.uniqueId}/codegen`),
    onSuccess: () => {
      invalidateFeature(qc, f.uniqueId);
      toast({ kind: "ok", title: t("codegen.started") });
      onClose();
      navigate(`/features/${f.uniqueId}/implementation`);
    },
  });
  return (
    <Modal wide title={t("codegen.title", { id: f.uniqueId })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={start.isPending || f.services.length === 0} onClick={() => start.mutate()}><Icon name="code" size={15} />{t("feature.startCodegen")}</button>
      </>
    }>
      <table className="cov">
        <thead><tr><th>{t("codegen.service")}</th><th>{t("codegen.repo")}</th><th>{t("codegen.autonomy")}</th><th>{t("codegen.agentPrepares")}</th></tr></thead>
        <tbody>
          {f.services.map((s) => (
            <tr key={s.key}><td><b>{s.key}</b></td><td className="mono small">{s.repo}</td><td>{t(`autonomy.${s.autonomy}.name`)}</td><td className="small t2">{t(`autonomy.${s.autonomy}.prepares`)}</td></tr>
          ))}
        </tbody>
      </table>
      {f.services.length === 0 && <div className="banner warn">{t("codegen.noServices")}</div>}
      <div className="banner info" style={{ marginTop: 12 }}><Icon name="merge" /><span>{t("codegen.notMerged")}</span></div>
      {start.error && <div className="err-text">{errorText(t, start.error)}</div>}
    </Modal>
  );
}

function FlagModal({ f, onClose }: { f: FeatureCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [flag, setFlag] = useState(f.flagKey ?? "");
  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/features/${f.uniqueId}`, { flagKey: flag }),
    onSuccess: () => { invalidateFeature(qc, f.uniqueId); onClose(); },
  });
  return (
    <Modal title={t("feature.flagKey")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      <div className="field">
        <label htmlFor="flag-key">{t("feature.flagKey")}</label>
        <input id="flag-key" className="inp mono" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="onboarding-v2" />
        <div className="hint">{t("feature.flagHint")}</div>
      </div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

function HistoryModal({ f, area, onClose }: { f: FeatureCard; area: Area; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const hist = useQuery({
    queryKey: keys.history(f.uniqueId, area),
    queryFn: () => api.get<List<HistoryItem>>(`/api/v1/features/${f.uniqueId}/gates/${area}/history?limit=100`),
  });
  return (
    <Modal title={t("history.gateTitle", { area: t(`areas.${area}`) })} onClose={onClose} wide
      footer={<button className="btn" onClick={onClose}>{t("common.close")}</button>}>
      {hist.isLoading && <Loading />}
      {hist.data?.items.length === 0 && <p className="muted">{t("history.empty")}</p>}
      <div className="hist">
        {hist.data?.items.map((h) => (
          <div className="h" key={h.id}>
            <Avatar small agent={h.isAgent} name={h.isAgent ? "A" : h.actor ?? "?"} />
            <div>
              {h.isAgent ? t("history.byAgent", { name: h.actor ?? "" }) : h.actor ?? t("history.unknown")}: {t(`history.events.${h.type}`)}
              <div className="muted">{relativeTime(h.createdAt, i18n.language)}</div>
            </div>
            {h.commit && h.commitUrl ? <a className="sha" href={h.commitUrl} target="_blank" rel="noreferrer">{shortSha(h.commit)}</a> : <span />}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function DeleteGateModal({ f, area, onClose }: { f: FeatureCard; area: Area; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useMutation({
    mutationFn: () => api.del(`/api/v1/features/${f.uniqueId}/gates/${area}`),
    onSuccess: () => {
      invalidateFeature(qc, f.uniqueId);
      qc.invalidateQueries({ queryKey: keys.approvals });
      onClose();
      navigate(`/features/${f.uniqueId}`);
    },
  });
  return (
    <Modal title={t("deleteGate.title", { area: t(`areas.${area}`) })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn danger-fill" disabled={del.isPending} onClick={() => del.mutate()}>{t("deleteGate.confirm")}</button>
      </>
    }>
      <p className="t2" style={{ margin: 0 }}>{t("deleteGate.text", { folder: `${area}/`, id: f.uniqueId })}</p>
      {del.error && <div className="err-text">{errorText(t, del.error)}</div>}
    </Modal>
  );
}

function DeleteFeatureModal({ f, onClose }: { f: FeatureCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const del = useMutation({
    mutationFn: () => api.del(`/api/v1/features/${f.uniqueId}`, { confirmKey: confirm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.features() });
      qc.invalidateQueries({ queryKey: keys.feature(f.uniqueId) });
      onClose();
    },
  });
  return (
    <Modal title={t("deleteFeature.title")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn danger-fill" disabled={confirm !== f.uniqueId || del.isPending} onClick={() => del.mutate()}>
          <Icon name="trash" size={15} />{t("deleteFeature.confirm")}
        </button>
      </>
    }>
      <p className="t2" style={{ margin: "0 0 12px" }}>{t("deleteFeature.text", { pr: f.pr.number, id: f.uniqueId })}</p>
      <div className="field">
        <label htmlFor="del-confirm">{t("deleteFeature.typeId")}</label>
        <input id="del-confirm" className="inp mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={f.uniqueId} autoComplete="off" />
      </div>
      {del.error && <div className="err-text">{errorText(t, del.error)}</div>}
    </Modal>
  );
}
