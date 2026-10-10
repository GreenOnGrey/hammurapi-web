import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { invalidateCycle, keys, useDiscovery, useDomains, useIssue, useRevisions } from "../api/queries";
import type { DiscoveryView, FeatureSummary, IssueCard, List } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { dateTime, relativeTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Loading, Modal, useToast } from "../components/ui";
import { AgentMark, IssueStatusBadge, IssueTypeBadge, KeyList, KeyLink } from "../components/cycle";
import { Markdown } from "../components/Markdown";
import { BlockedBanner } from "../components/BlockedBanner";

export function IssuePage() {
  const { t } = useTranslation();
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const issue = useIssue(key);
  const chat = useChatContext();
  const is = issue.data;

  // An old key after a move answers 308 with the canonical key (R2).
  useEffect(() => {
    const e = issue.error;
    if (e instanceof ApiError && e.status === 308) {
      const k = String((e.details as { key?: string }).key ?? "");
      if (k) navigate(`/issues/${k}`, { replace: true });
    }
  }, [issue.error, navigate]);
  const { setSubject } = chat;
  const isKey = is?.key;
  const isTitle = is?.title;
  useEffect(() => {
    if (!isKey || isTitle === undefined) return;
    setSubject({ type: "issue", key: isKey, title: isTitle });
    // The browser follows the 308 of a former key: show the canonical key in the URL.
    if (isKey !== key) navigate(`/issues/${isKey}`, { replace: true });
  }, [isKey, isTitle, key, navigate, setSubject]);

  if (issue.isLoading) return <main className="main"><Loading /></main>;
  if (!is) {
    return (
      <main className="main">
        <Empty icon="alert" title={t("issue.notFound", { key })}>
          <div className="acts"><Link className="btn sm" to="/research">{t("stages.research")}</Link></div>
        </Empty>
      </main>
    );
  }
  return <IssueView is={is} />;
}

type Dialog = "accept" | "reject" | "merge" | "move" | "history" | "edit" | null;

function IssueView({ is }: { is: IssueCard }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const disc = useDiscovery(is.key);
  const { config } = useSession();
  // FTR.HMR.CMN-0006 R9: without the agent the expert fills Discovery by hand.
  const noAgent = config.agent?.enabled === false;
  const [dialog, setDialog] = useState<Dialog>(null);
  const act = useMutation({
    mutationFn: (path: string) => api.post(`/api/v1/issues/${is.key}${path}`),
    onSuccess: () => invalidateCycle(qc),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const d = disc.data;
  const running = is.status === "new" || is.status === "discovery";
  const blocked = d?.workflow?.state === "blocked";
  return (
    <main className="main">
      <div className="crumbs">
        <Link to="/research" aria-label={t("common.back")}><Icon name="back" size={16} /></Link>
        {is.domain} / <KeyLink k={is.key} plain /> <IssueTypeBadge type={is.type} />
      </div>
      <h1 className="ftitle">{is.title}</h1>
      <div className="meta">
        <IssueStatusBadge status={is.status} />
        <span>{t(`issueSource.${is.source}`)}{is.author ? ` · ${is.author}` : ""} · {relativeTime(is.createdAt, i18n.language)}</span>
        {is.features.length > 0 && <span>{t("issue.features")} <KeyList keys={is.features} /></span>}
        {is.releases.length > 0 && <span>{t("issue.releases")} <KeyList keys={is.releases} /></span>}
        {is.movedFrom.length > 0 && <span className="muted">{t("issue.movedFrom", { keys: is.movedFrom.join(", ") })}</span>}
        {is.mergedFrom.length > 0 && <span>{t("issue.mergedFrom")} <KeyList keys={is.mergedFrom} /></span>}
        {(is.tokensIn + is.tokensOut) > 0 && <span className="muted">{t("common.tokens", { n: (is.tokensIn + is.tokensOut).toLocaleString(i18n.language) })}</span>}
      </div>

      {is.rolledBackRelease && (
        <div className="banner warn"><Icon name="undo" /><span className="grow">{t("issue.rolledBack")} <KeyList keys={[is.rolledBackRelease]} /></span></div>
      )}
      {is.status === "rejected" && (
        <div className="banner warn"><Icon name="x" /><span className="grow"><b>{t("issue.rejected")}</b> {is.rejectReason}</span>
          {is.permissions.reopen && <button className="btn sm" onClick={() => act.mutate("/reopen")}>{t("issue.reopen")}</button>}
        </div>
      )}
      {is.status === "merged" && is.mergedInto && (
        <div className="banner info"><Icon name="merge" /><span className="grow">{t("issue.mergedInto")} <KeyList keys={[is.mergedInto]} /></span></div>
      )}

      <section className="docsec">
        <h5>{t("issue.description")}</h5>
        <div className="prose small">{is.description ? <Markdown text={is.description} /> : <span className="muted">—</span>}</div>
      </section>

      <div className="row" style={{ margin: "18px 0 8px" }}>
        <h2 className="sec" style={{ margin: 0 }}>{t("issue.analysis")}</h2>
        {!noAgent && <AgentMark />}
        {d?.revision && <button className="btn ghost sm" onClick={() => setDialog("history")}>{t("issue.revision", { n: d.revision })}</button>}
        <span className="grow" />
        {is.permissions.verify && (noAgent || !running || blocked) && (
          <button className="btn sm" onClick={() => setDialog("edit")}><Icon name="wrench" size={14} />{t("issue.editDiscovery")}</button>
        )}
        {!noAgent && is.permissions.discover && (blocked || !running) && (
          <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate("/discover")}><Icon name="refresh" size={14} />{t("issue.rediscover")}</button>
        )}
      </div>
      {noAgent && !d?.complete && <div className="banner info"><Icon name="cpu" /><span className="grow">{t("issue.manualDiscovery")}</span></div>}
      {!noAgent && running && !d?.content && <DiscoveryRunning d={d} />}
      {blocked && <BlockedBanner title={t("issue.discoveryBlocked")} reason={d?.workflow?.lastError} />}
      {d?.content && <DiscoveryDoc d={d} />}

      {is.permissions.verify && (
        <div className="actionbar sticky">
          {!d?.complete && <span className="small err-text" style={{ margin: 0 }}>{t("issue.missing", { fields: (d?.missing ?? []).map((m) => t(`issue.field.${m}`)).join(", ") })}</span>}
          <span className="grow" />
          <button className="btn sm" onClick={() => setDialog("move")}>{t("issue.move")}</button>
          <button className="btn sm" onClick={() => setDialog("merge")}>{t("issue.merge")}</button>
          <button className="btn sm danger" onClick={() => setDialog("reject")}>{t("issue.reject")}</button>
          <button className="btn primary sm" disabled={!d?.complete} title={d?.complete ? undefined : t("issue.acceptDisabled")} onClick={() => setDialog("accept")}>
            <Icon name="check" size={15} />{t("issue.accept")}
          </button>
        </div>
      )}
      {is.activity.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h3 className="group-h">{t("issue.history")}</h3>
          <ul className="hist">
            {is.activity.map((a) => (
              <li key={a.id}><span className="small">{t(`activity.${a.type}`, { defaultValue: a.type })}</span>
                <span className="small muted">{a.isAgent ? t("common.agent") : a.actor ?? ""} · {dateTime(a.createdAt, i18n.language)}</span></li>
            ))}
          </ul>
        </section>
      )}
      {dialog === "accept" && <AcceptModal is={is} d={d} onClose={() => setDialog(null)} />}
      {dialog === "reject" && <ReasonModal is={is} onClose={() => setDialog(null)} />}
      {dialog === "merge" && <MergeModal is={is} onClose={() => setDialog(null)} />}
      {dialog === "move" && <MoveModal is={is} onClose={() => setDialog(null)} />}
      {dialog === "history" && <RevisionsModal is={is} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <DiscoveryEditModal is={is} d={d} onClose={() => setDialog(null)} />}
    </main>
  );
}

function DiscoveryRunning({ d }: { d?: DiscoveryView }) {
  const { t } = useTranslation();
  return (
    <div className="docsec">
      <div className="steps">
        <div><span className="ring" />{t("issue.agentWorking")}</div>
        {d?.workflow?.nextRunAt && <div className="small muted">{t("issue.retrying")}</div>}
      </div>
    </div>
  );
}

function DiscoveryDoc({ d }: { d: DiscoveryView }) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <section className="docsec">
        <h5>{t("issue.value")} <span className="req">{t("issue.required")}</span></h5>
        {d.value ? <p style={{ margin: 0 }}>{d.value}</p> : <span className="err-text">{t("issue.notFilled")}</span>}
      </section>
      <section className="docsec">
        <h5>{t("issue.measure")} <span className="req">{t("issue.required")}</span></h5>
        {d.measure ? (
          <table className="cov">
            <thead><tr><th>{t("issue.source")}</th><th>{t("issue.query")}</th><th>{t("issue.target")}</th><th>{t("issue.window")}</th></tr></thead>
            <tbody><tr><td>{d.measure.source}</td><td className="mono small">{d.measure.query}</td><td>{d.measure.target}</td><td>{d.measure.window}</td></tr></tbody>
          </table>
        ) : <span className="err-text">{t("issue.notFilled")}</span>}
        {d.measureCheckedAt && <div className="small muted" style={{ marginTop: 6 }}><Icon name="check" size={12} /> {t("issue.checked", { at: dateTime(d.measureCheckedAt, i18n.language) })}</div>}
      </section>
      {(d.similar?.length ?? 0) > 0 && (
        <section className="docsec">
          <h5>{t("issue.similar")}</h5>
          {d.similar!.map((s) => <div key={s.key} className="small"><KeyLink k={s.key} /> {s.title}</div>)}
        </section>
      )}
      {d.problemTarget && (
        <section className="docsec"><h5>{t("issue.problemFeature")}</h5><KeyLink k={d.problemTarget} /></section>
      )}
      <section className="docsec">
        <h5>{t("issue.document")}</h5>
        <Markdown text={d.content ?? ""} />
      </section>
    </>
  );
}

/** Value, measure and the analysis written by the expert (PUT …/discovery, FTR.HMR.CMN-0006 tech §5). */
function DiscoveryEditModal({ is, d, onClose }: { is: IssueCard; d?: DiscoveryView; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(d?.value ?? "");
  const [m, setM] = useState({ source: d?.measure?.source ?? "", query: d?.measure?.query ?? "", target: d?.measure?.target ?? "", window: d?.measure?.window ?? "" });
  const [content, setContent] = useState(d?.content ?? "");
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/issues/${is.key}/discovery`, {
      content: content.trim() || `## ${t("issue.value")}\n\n${value}`,
      value,
      measure: m.source || m.query || m.target || m.window ? m : null,
    }),
    onSuccess: () => {
      invalidateCycle(qc);
      qc.invalidateQueries({ queryKey: keys.discovery(is.key) });
      onClose();
    },
  });
  const field = (k: keyof typeof m) => (
    <div className="field" key={k}>
      <label htmlFor={`disc-${k}`}>{t(`issue.${k}`)}</label>
      <input id={`disc-${k}`} className={`inp${k === "query" ? " mono" : ""}`} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
    </div>
  );
  return (
    <Modal wide title={t("issue.editDiscovery")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
    </>}>
      <div className="field">
        <label htmlFor="disc-value">{t("issue.value")} <span className="req">{t("issue.required")}</span></label>
        <textarea id="disc-value" className="inp" rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <h5 style={{ margin: "8px 0" }}>{t("issue.measure")} <span className="req">{t("issue.required")}</span></h5>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0 12px" }}>
        {(["source", "query", "target", "window"] as const).map(field)}
      </div>
      <div className="field">
        <label htmlFor="disc-content">{t("issue.document")}</label>
        <textarea id="disc-content" className="inp mono" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

function AcceptModal({ is, d, onClose }: { is: IssueCard; d?: DiscoveryView; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const domains = useDomains();
  const dom = domains.data?.find((x) => x.key === is.domain);
  const [system, setSystem] = useState("");
  const [parent, setParent] = useState(d?.problemTarget ?? "");
  const [noFeature, setNoFeature] = useState(false);
  const released = useQuery({
    queryKey: ["features", "parents", is.domain],
    queryFn: () => api.get<List<FeatureSummary>>(`/api/v1/features?domain=${is.domain}&status=all&limit=200`),
    enabled: is.type === "problem",
  });
  const sys = system || dom?.systems[0]?.key || "";
  const fixMode = is.type === "problem" && !noFeature;
  const accept = useMutation({
    mutationFn: () => api.post<{ featureKey: string }>(`/api/v1/issues/${is.key}/accept`, fixMode ? { parentFeature: parent } : { system: sys, noFeature: is.type === "problem" }),
    onSuccess: (r) => {
      invalidateCycle(qc);
      onClose();
      navigate(`/features/${r.featureKey}`);
    },
  });
  const nextNum = dom?.systems.find((s) => s.key === sys)?.lastNumber;
  return (
    <Modal title={t("accept.title", { key: is.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={accept.isPending || (fixMode ? !parent : !sys)} onClick={() => accept.mutate()}>{t("issue.accept")}</button>
      </>
    }>
      {is.type === "problem" && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button aria-pressed={!noFeature} onClick={() => setNoFeature(false)}>{t("accept.fix")}</button>
          <button aria-pressed={noFeature} onClick={() => setNoFeature(true)}>{t("accept.noFeature")}</button>
        </div>
      )}
      {fixMode ? (
        <div className="field">
          <label htmlFor="acc-parent">{t("accept.parent")}</label>
          <select id="acc-parent" className="inp" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">—</option>
            {released.data?.items.map((f) => <option key={f.uniqueId} value={f.uniqueId}>{f.uniqueId} {f.title}</option>)}
          </select>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="acc-system">{t("newFeature.system")}</label>
          <select id="acc-system" className="inp" value={sys} onChange={(e) => setSystem(e.target.value)}>
            {dom?.systems.map((s) => <option key={s.key} value={s.key}>{s.key} — {s.name}</option>)}
          </select>
        </div>
      )}
      {!fixMode && nextNum !== undefined && (
        <div className="preview-id">{t("accept.preview", { key: `FTR.${is.domain}.${sys}-${String(nextNum + 1).padStart(4, "0")}`, issue: is.key })}</div>
      )}
      <p className="small t2">{t("accept.text")}</p>
      {accept.error && <div className="err-text">{errorText(t, accept.error)}</div>}
    </Modal>
  );
}

function ReasonModal({ is, onClose }: { is: IssueCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/issues/${is.key}/reject`, { reason }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("reject.title", { key: is.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn danger-fill" disabled={!reason.trim() || go.isPending} onClick={() => go.mutate()}>{t("issue.reject")}</button>
      </>
    }>
      <div className="field">
        <label htmlFor="rej-reason">{t("reject.reason")}</label>
        <textarea id="rej-reason" className="inp" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="hint">{t("reject.hint")}</div>
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function MergeModal({ is, onClose }: { is: IssueCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [into, setInto] = useState("");
  const go = useMutation({
    mutationFn: () => api.post(`/api/v1/issues/${is.key}/merge`, { into: into.trim() }),
    onSuccess: () => { invalidateCycle(qc); onClose(); },
  });
  return (
    <Modal title={t("merge.title", { key: is.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!into.trim() || go.isPending} onClick={() => go.mutate()}>{t("issue.merge")}</button>
      </>
    }>
      <div className="field">
        <label htmlFor="mrg-into">{t("merge.into")}</label>
        <input id="mrg-into" className="inp mono" placeholder="ISS.FMS-0031" value={into} onChange={(e) => setInto(e.target.value)} />
        <div className="hint">{t("merge.hint")}</div>
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function MoveModal({ is, onClose }: { is: IssueCard; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const domains = useDomains();
  const [domain, setDomain] = useState("");
  const target = domain || domains.data?.find((d) => d.key !== is.domain)?.key || "";
  const go = useMutation({
    mutationFn: () => api.post<{ key: string }>(`/api/v1/issues/${is.key}/move`, { domain: target }),
    onSuccess: (r) => { invalidateCycle(qc); onClose(); navigate(`/issues/${r.key}`); },
  });
  return (
    <Modal title={t("move.title", { key: is.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!target || go.isPending} onClick={() => go.mutate()}>{t("issue.move")}</button>
      </>
    }>
      <div className="field">
        <label htmlFor="mv-domain">{t("move.domain")}</label>
        <select id="mv-domain" className="inp" value={target} onChange={(e) => setDomain(e.target.value)}>
          {domains.data?.filter((d) => d.key !== is.domain).map((d) => <option key={d.key} value={d.key}>{d.key} — {d.name}</option>)}
        </select>
        <div className="hint">{t("move.hint", { key: is.key })}</div>
      </div>
      {go.error && <div className="err-text">{errorText(t, go.error)}</div>}
    </Modal>
  );
}

function RevisionsModal({ is, onClose }: { is: IssueCard; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const revs = useRevisions(is.key, true);
  return (
    <Modal wide title={t("issue.revisions")} onClose={onClose}>
      {revs.isLoading && <Loading />}
      {revs.data?.items.toReversed().map((r) => (
        <details key={r.revision} className="docsec">
          <summary className="row small">
            <b>#{r.revision}</b> {r.isAgent ? <AgentMark /> : null} <span className="t2">{r.actor ?? ""}</span>
            <span className="muted">{dateTime(r.createdAt, i18n.language)}</span>
          </summary>
          <Markdown text={r.content} />
        </details>
      ))}
    </Modal>
  );
}
