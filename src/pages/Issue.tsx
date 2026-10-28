import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { invalidateCycle, keys, useDiscovery, useDomains, useIssue, useRevisions } from "../api/queries";
import type { TFunction } from "i18next";
import type { DiscoveryView, FeatureSummary, IssueCard, List, Revision } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { dateTime, relativeTime } from "../lib/format";
import { Empty, Icon, Loading, Markdown, Modal, useToast } from "@green-on-grey/ui-kit";
import { AgentMark, IssueStatusBadge, IssueTypeBadge, KeyList, KeyLink } from "../components/cycle";
import { BlockedBanner } from "../components/BlockedBanner";
import { EstimateBlock, EstimateChip, discoveryBody } from "./IssueEstimate";
import { QuestionsBlock, linkQuestions, useQuestionLinks } from "./IssueQuestions";

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
  const chat = useChatContext();
  const { isExpertOf } = useSession();
  const expert = isExpertOf(is.domain);
  const [estOpen, setEstOpen] = useState(false);
  // FTR.HMR.DISC-0001 R5: «Send back for revision» opens the chat of the issue with the focus in the composer
  const reviseInChat = () => {
    chat.setCollapsed(false);
    chat.setOpen(true);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>(".chat textarea")?.focus(), 50);
  };
  const revising = running && !!d?.revision; // the researcher revises an existing document
  // FTR.HMR.DISC-0001 R27: experts answer the questions while Discovery can change
  const canAnswer = expert && !noAgent && (running || is.status === "verification");
  const nabu = config.agent?.provider === "nabu";
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
        {/* FTR.HMR.DISC-0001 R17: the cost of the work in the header */}
        <EstimateChip d={d} onOpen={() => { setEstOpen(true); document.getElementById("estimate")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
        {!noAgent && running && !d?.estimateTotals && <span className="muted">{t("disc.est.preparing")}</span>}
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
      {revising && !blocked && <RevisionBanner d={d} />}
      {d?.content && <DiscoveryDoc d={d} issueKey={is.key} canAnswer={canAnswer}
        estimate={<EstimateBlock is={is} d={d} open={estOpen} setOpen={setEstOpen} canEdit={expert && (noAgent || !running || blocked)} />} />}

      {(is.permissions.verify || (expert && revising && !blocked)) && (
        <div className="actionbar sticky">
          {revising && !blocked
            ? <span className="small muted ab-err" style={{ margin: 0 }}>{t("disc.waitRevision")}</span>
            : !d?.complete && <span className="small err-text ab-err" style={{ margin: 0 }}>{t("issue.missing", { fields: (d?.missing ?? []).map((m) => t(`issue.field.${m}`)).join(", ") })}</span>}
          <span className="grow ab-grow" />
          <button className="btn sm" disabled={revising} onClick={() => setDialog("move")}>{t("issue.move")}</button>
          <button className="btn sm" disabled={revising} onClick={() => setDialog("merge")}>{t("issue.merge")}</button>
          <button className="btn sm danger" disabled={revising} onClick={() => setDialog("reject")}>{t("issue.reject")}</button>
          {nabu && !noAgent && !revising && <button className="btn sm" onClick={reviseInChat}><Icon name="msg" size={14} />{t("disc.sendBack")}</button>}
          <button className="btn primary sm" disabled={!d?.complete || revising} title={d?.complete ? undefined : t("issue.acceptDisabled")} onClick={() => setDialog("accept")}>
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

/** The researcher revises the document by instructions (FTR.HMR.DISC-0001 design §3.5). */
function RevisionBanner({ d }: { d?: DiscoveryView }) {
  const { t } = useTranslation();
  const r = d?.running;
  return (
    <div className="banner info" role="status">
      <span className="ring" />
      <span className="grow">
        {r?.requestAuthors.length ? t("disc.revising", { authors: r.requestAuthors.join(", ") }) : t("issue.agentWorking")}
        {r && r.queued > 0 ? ` · ${t("disc.queued", { count: r.queued })}` : ""}
      </span>
    </div>
  );
}

/** «Похожее» — folded like the estimate (FTR.HMR.DISC-0001 design §3.6b): the line names the possible
 * duplicates first; unfolded — every item with how it relates. */
function SimilarBlock({ items }: { items: NonNullable<DiscoveryView["similar"]> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dups = items.filter((s) => s.duplicate);
  const line = dups.length > 0
    ? t("disc.similar.dups", { count: dups.length, keys: dups.map((s) => s.key).join(", ") })
    : t("disc.similar.line", { count: items.length, keys: items.slice(0, 2).map((s) => s.key).join(", ") });
  return (
    <section className="docsec">
      <button type="button" className="estline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{t("issue.similar")}</b>
        <span className={`estgrow small ${dups.length > 0 ? "simwarn" : "t2"}`}>{open ? "" : line}</span>
        <span className="st none">{items.length}</span>
        <Icon name="chevrons" size={16} className={`estchev${open ? " open" : ""}`} />
      </button>
      {open && (
        <ul className="similarlist">
          {items.toSorted((a, b) => Number(!!b.duplicate) - Number(!!a.duplicate)).map((s) => (
            <li key={s.key}>
              <div className="simhead"><KeyLink k={s.key} /> <span>{s.title}</span>
                {s.duplicate && <span className="st in_review">{t("disc.similar.duplicate")}</span>}</div>
              {s.note && <div className="small t2">{s.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** «Как измерим» — optional and folded like the estimate (FTR.HMR.DISC-0001 R23, design §3.6a). */
function MeasureBlock({ d }: { d: DiscoveryView }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const m = d.measure;
  if (!m) {
    return (
      <section className="docsec">
        <div className="estline" style={{ cursor: "default" }}>
          <b>{t("issue.measure")}</b>
          <span className="estgrow small muted">{t("disc.measure.none")}</span>
        </div>
      </section>
    );
  }
  return (
    <section className="docsec">
      <button type="button" className="estline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{t("issue.measure")}</b>
        <span className="estgrow small t2">{open ? "" : t("disc.measure.line", { source: m.source, target: m.target, window: m.window })}</span>
        {d.measureCheckedAt && <span className="st approved">{t("disc.measure.checked")}</span>}
        <Icon name="chevrons" size={16} className={`estchev${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="measuregrid">
          <div className="muted small">{t("issue.source")}</div><div>{m.source}</div>
          <div className="muted small">{t("issue.target")}</div><div>{m.target}</div>
          <div className="muted small">{t("issue.window")}</div><div>{m.window}</div>
          <div className="muted small">{t("issue.query")}</div><pre className="measurequery">{m.query}</pre>
          {d.measureCheckedAt && <><span /><div className="small muted"><Icon name="check" size={12} /> {t("issue.checked", { at: dateTime(d.measureCheckedAt, i18n.language) })}</div></>}
        </div>
      )}
    </section>
  );
}

function DiscoveryDoc({ d, issueKey, canAnswer, estimate }: { d: DiscoveryView; issueKey: string; canAnswer: boolean; estimate?: ReactNode }) {
  const { t } = useTranslation();
  const links = useQuestionLinks();
  const ids = (d.questions ?? []).map((q) => q.id);
  return (
    <>
      <section className="docsec">
        <h5>{t("issue.value")} <span className="req">{t("issue.required")}</span></h5>
        {d.value ? <p style={{ margin: 0 }}>{d.value}</p> : <span className="err-text">{t("issue.notFilled")}</span>}
      </section>
      <MeasureBlock d={d} />
      {estimate}
      {(d.similar?.length ?? 0) > 0 && <SimilarBlock items={d.similar!} />}
      {d.problemTarget && (
        <section className="docsec"><h5>{t("issue.problemFeature")}</h5><KeyLink k={d.problemTarget} /></section>
      )}
      {/* FTR.HMR.DISC-0001 design §3.6c: «(допущение, см. Q5)» leads to the question */}
      <section className="docsec" onClick={links.onClick}>
        <h5>{t("issue.document")}</h5>
        <Markdown text={linkQuestions(d.content ?? "", ids)} />
      </section>
      <QuestionsBlock key={`${issueKey}:${d.revision}`} issueKey={issueKey} d={d} canAnswer={canAnswer} highlighted={links.highlighted} />
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
    // the estimate and the rest of the document stay (FTR.HMR.DISC-0001 R18)
    mutationFn: () => api.put(`/api/v1/issues/${is.key}/discovery`, discoveryBody(d, {
      // the value is a block of its own: an empty analysis gets only its heading (FTR.HMR.DISC-0001 design §3.6)
      content: content.trim() || `## ${t("issue.document")}\n`,
      value,
      measure: m.source || m.query || m.target || m.window ? m : null,
    })),
    onSuccess: () => {
      invalidateCycle(qc);
      qc.invalidateQueries({ queryKey: keys.discovery(is.key) });
      onClose();
    },
  });
  // FTR.HMR.DISC-0001 R23: the source is one of the configured metric sources, never a free text
  const sources = useQuery({ queryKey: ["metric-sources"], queryFn: () => api.get<{ items: { name: string; type: string }[] }>("/api/v1/metric-sources") });
  const field = (k: keyof typeof m) => (
    <div className="field" key={k}>
      <label htmlFor={`disc-${k}`}>{t(`issue.${k}`)}</label>
      {k === "source" ? (
        <select id="disc-source" className="inp" value={m.source} onChange={(e) => setM({ ...m, source: e.target.value })}>
          <option value="">{t("disc.measure.noSource")}</option>
          {sources.data?.items.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.type})</option>)}
          {m.source && !sources.data?.items.some((s) => s.name === m.source) && <option value={m.source} disabled>{m.source}</option>}
        </select>
      ) : (
        <input id={`disc-${k}`} className={`inp${k === "query" ? " mono" : ""}`} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
      )}
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
      <h5 style={{ margin: "8px 0" }}>{t("issue.measure")} <span className="small muted" style={{ fontWeight: 400 }}>{t("disc.measure.optional")}</span></h5>
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
      {/* FTR.HMR.DISC-0001 design §3.6c: the questions do not block the acceptance */}
      {(d?.questions?.length ?? 0) > 0 && <div className="banner warn"><Icon name="alert" /><span className="grow">{t("disc.q.acceptOpen", { count: d!.questions!.length })}</span></div>}
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

/** «Поручение: «…» · Ответы: Q1, Q2 · А. Петров» — what a revision answered (FTR.HMR.DISC-0001 design §3.5). */
export function revisionRequests(t: TFunction, reqs: NonNullable<Revision["requests"]>): string {
  const text = reqs.find((q) => q.instructions)?.instructions;
  const ids = reqs.flatMap((q) => q.questions ?? []);
  return [
    text ? `${t("disc.instruction")}: «${text}»` : "",
    ids.length > 0 ? t("disc.q.revAnswers", { ids: ids.join(", ") }) : "",
    [...new Set(reqs.map((q) => q.author ?? ""))].join(", "),
  ].filter(Boolean).join(" · ");
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
            <b>#{r.revision}</b> {r.isAgent ? <AgentMark /> : null} <span className="t2">{r.isAgent ? "" : `${t("disc.manual")} · ${r.actor ?? ""}`}</span>
            {/* FTR.HMR.DISC-0001 design §3.5: the instructions the revision answers */}
            {(r.requests?.length ?? 0) > 0 && <span className="t2">{revisionRequests(t, r.requests!)}</span>}
            <span className="muted">{dateTime(r.createdAt, i18n.language)}</span>
          </summary>
          {r.changeSummary && <Markdown text={r.changeSummary} />}
          <Markdown text={r.content} />
        </details>
      ))}
    </Modal>
  );
}
