import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { invalidateFeature, keys, useFeature } from "../api/queries";
import { AREAS, type Area, type CodegenPlan, type FeatureCard, type Gate, type HistoryItem, type List } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { adminPath } from "./admin/paths";
import { DocumentPane } from "../editor/DocumentPane";
import { errorText } from "../lib/errors";
import { dateTime, relativeTime, shortSha } from "../lib/format";
import { Avatar, Empty, Icon, Loading, Modal, useOutside, useToast } from "@green-on-grey/ui-kit";
import { StatusBadge } from "../components/ui";
import { AgentMark, KeyList, PhaseBadge } from "../components/cycle";
import { ImplementationTab } from "./feature/Implementation";
import { ValidationTab } from "./feature/Validation";
import { ActivityTab } from "./feature/Activity";
import { BlockedBanner } from "../components/BlockedBanner";
import { SpecQuestions } from "./feature/SpecQuestions";
import { SpecChanges, useChangesInvalid } from "./feature/SpecChanges";
import { GateView } from "./feature/GateView";
import { FeatureLinks } from "./feature/FeatureLinks";
import { useQuestionLinks } from "./IssueQuestions";

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
  // FTR.HMR.DEV-0001 R16: on the tab of the specification, in its phase, the chat is pinned to the topic of the feature
  const pinned = tab === "spec" && f?.phase === "spec";
  useEffect(() => {
    if (fid && ftitle !== undefined) setSubject({ type: "feature", key: fid, title: ftitle, pinned }, tab === "spec" ? area ?? null : null);
  }, [fid, ftitle, area, tab, pinned, setSubject]);

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
  // FTR.HMR.DEV-0001 R27: a link to a stage the feature has not reached opens the current one
  if (tab !== "history" && stageIndex(tab) > reachedStage(f)) return <Navigate to={stageLink(f.uniqueId, STAGES[reachedStage(f)].tab)} replace />;
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

// FTR.HMR.DEV-0001 R26, R27: one strip of the stages of a feature; a stage shows
// its state and opens its screen. Release is the next stage of the cycle, not of this page.
export const STAGES = [
  { phase: "spec", tab: "spec", label: "path.spec" },
  { phase: "codegen", tab: "implementation", label: "path.codegen" },
  { phase: "validation", tab: "validation", label: "path.validation" },
] as const;

const stageIndex = (tab: Tab) => STAGES.findIndex((s) => s.tab === tab);
const stageLink = (id: string, tab: Tab) => (tab === "spec" ? `/features/${id}` : `/features/${id}/${tab}`);

/** The stage a feature is on; past the last one every stage is passed. */
export function reachedStage(f: Pick<FeatureCard, "phase">): number {
  const i = STAGES.findIndex((s) => s.phase === f.phase);
  return i >= 0 ? i : STAGES.length - 1;
}

/** Whether every stage is passed: the status is in the badge of the header. */
export const allStagesPassed = (f: Pick<FeatureCard, "phase">) => !STAGES.some((s) => s.phase === f.phase);

function FeatureStages({ f, tab }: { f: FeatureCard; tab: Tab }) {
  const { t } = useTranslation();
  const now = allStagesPassed(f) ? STAGES.length : reachedStage(f);
  return (
    <nav className="stages" aria-label={t("feature.stages")}>
      {STAGES.map((s, i) => {
        const state = i < now ? "done" : i === now ? "now" : "later";
        const inner = <><span className="c">{i < now ? <Icon name="check" size={13} /> : i + 1}</span><span className="nm">{t(s.label)}</span></>;
        const cls = `sg ${state}${s.tab === tab ? " open" : ""}`;
        return state === "later"
          ? <div key={s.phase} className={cls} aria-disabled="true" title={t("feature.stageLater")}>{inner}</div>
          : <NavLink key={s.phase} to={stageLink(f.uniqueId, s.tab)} end={s.tab === "spec"} className={() => cls} aria-current={s.tab === tab ? "step" : undefined}>{inner}</NavLink>;
      })}
    </nav>
  );
}

type Dialog =
  | { kind: "history"; area: Area }
  | { kind: "deleteFeature" }
  | { kind: "codegen" }
  | { kind: "unnumbered"; area: Area; list: string[]; decisions?: boolean }
  | { kind: "flag" }
  | { kind: "openQuestions"; area: Area; list: { id: string; title: string }[] }
  | null;

function FeatureView({ f, tab, area }: { f: FeatureCard; tab: Tab; area?: Area }) {
  const { t, i18n } = useTranslation();
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
      if (e instanceof ApiError && e.code === "decisions_without_id" && area) { // FTR.HMR.DEV-0003 R16
        setDialog({ kind: "unnumbered", area, list: (e.details.decisions as string[]) ?? [], decisions: true });
        return;
      }
      if (e instanceof ApiError && e.code === "changes_invalid") qc.invalidateQueries({ queryKey: keys.specChanges(f.uniqueId) }); // FTR.HMR.DEV-0002 R3: the rows show why
      if (e instanceof ApiError && e.code === "open_questions" && area) { // FTR.HMR.DEV-0001 R14
        setDialog({ kind: "openQuestions", area, list: (e.details.questions as { id: string; title: string }[]) ?? [] });
        return;
      }
      toast({ kind: "error", title: errorText(t, e) });
    },
  });
  const submit = (a: Area, body?: Record<string, unknown>) =>
    act.mutate({ path: `/gates/${a}/submit`, body }, { onSuccess: () => toast({ kind: "ok", title: t("feature.submitted") }) });

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
        {/* centered on the first line of the title, whatever its length */}
        <div style={{ display: "flex", alignItems: "center", height: 36 }}><PhaseBadge phase={f.phase} /></div>
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
        {/* FTR.HMR.DEV-0001 R29: the history is not a stage */}
        <NavLink to={`/features/${f.uniqueId}/history`} className={`btn ghost sm metahist${tab === "history" ? " on" : ""}`}><Icon name="clock" size={14} />{t("feature.tabs.history")}</NavLink>
      </div>

      {/* FTR.HMR.DEV-0003 R7: the links of the feature in work, under meta, above the stages */}
      {specPhase && <FeatureLinks featureKey={f.uniqueId} />}

      <FeatureStages f={f} tab={tab} />

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
          {specPhase && f.permissions.codegen && (
            <div className="banner ok">
              <Icon name="code" />
              <span className="grow"><b>{t("feature.readyForCodegen")}</b> {t("feature.readyForCodegenHint")}</span>
              <button className="btn primary sm" onClick={() => setDialog({ kind: "codegen" })}>{t("feature.startCodegen")}</button>
            </div>
          )}

          <SpecPanel f={f} area={area} gate={gate} busy={act.isPending} onDialog={setDialog}
            onSubmit={() => gate && submit(gate.area)}
            onApprove={() => gate && act.mutate({ path: `/gates/${gate.area}/approve` }, { onSuccess: () => toast({ kind: "ok", title: t("feature.approved") }) })}
            onAdvance={() => act.mutate({ path: "/spec/advance" })}
            onRetry={() => act.mutate({ path: "/spec/retry" })} />
        </>
      )}

      {dialog?.kind === "history" && <HistoryModal f={f} area={dialog.area} onClose={() => setDialog(null)} />}
      {dialog?.kind === "deleteFeature" && <DeleteFeatureModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "codegen" && <CodegenModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "flag" && <FlagModal f={f} onClose={() => setDialog(null)} />}
      {dialog?.kind === "unnumbered" && (
        <Modal title={t(dialog.decisions ? "unnumbered.decisionsTitle" : "unnumbered.title")} onClose={() => setDialog(null)} footer={
          <>
            <button className="btn ghost" onClick={() => {
              setDialog(null);
              chat.send(t(dialog.decisions ? "unnumbered.decisionsPrompt" : "unnumbered.prompt"));
            }}>{t(dialog.decisions ? "unnumbered.decisionsAskAgent" : "unnumbered.askAgent")}</button>
            <button className="btn primary" onClick={() => {
              const a = dialog.area;
              setDialog(null);
              submit(a, { force: true });
            }}>{t("unnumbered.submitAnyway")}</button>
          </>
        }>
          <p className="t2" style={{ marginTop: 0 }}>{t(dialog.decisions ? "unnumbered.decisionsText" : "unnumbered.text", { count: dialog.list.length })}</p>
          <ul className="small">{dialog.list.map((x) => <li key={x}>{x}</li>)}</ul>
        </Modal>
      )}
      {dialog?.kind === "openQuestions" && (
        <Modal title={t("writer.open.title")} onClose={() => setDialog(null)} footer={
          <>
            <button className="btn ghost" onClick={() => setDialog(null)}>{t("writer.open.answer")}</button>
            <button className="btn primary" onClick={() => {
              const a = dialog.area;
              setDialog(null);
              // the check of the requirements has passed or was forced by the previous dialog (design §3.5)
              submit(a, { force: true, forceQuestions: true });
            }}>{t("writer.open.submit")}</button>
          </>
        }>
          <ul className="small">{dialog.list.map((x) => <li key={x.id}><span className="fid">{x.id}</span> {x.title}</li>)}</ul>
          <p className="t2 small">{t("writer.open.text")}</p>
        </Modal>
      )}
    </main>
  );
}

// ─── The panel of the specifications ─────────────────────────────

/** Icons of the gates: on a narrow panel only the chosen gate keeps its caption (FTR.HMR.DEV-0001 design §3.2a). */
export const GATE_ICONS: Record<Area, "bulb" | "grid" | "server" | "code" | "flask"> = { product: "bulb", design: "grid", arch: "server", tech: "code", qa: "flask" };

function SpecPanel({ f, area, gate, busy, onDialog, onSubmit, onApprove, onAdvance, onRetry }: {
  f: FeatureCard; area?: Area; gate?: Gate; busy: boolean; onDialog: (d: Dialog) => void;
  onSubmit: () => void; onApprove: () => void; onAdvance: () => void; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const run = f.writerRun;
  const blocked = f.workflow?.kind === "gate_generation" && f.workflow.state === "blocked";
  // FTR.HMR.DEV-0001 R32: the reason the core sets when the scenario has no service agent
  const noAgent = blocked && f.workflow?.lastError === "no_service_agent";
  const { me } = useSession();
  const skipped = !!area && f.skippedAreas.includes(area);
  const { highlighted, onClick } = useQuestionLinks();
  return (
    <section className="specpanel" aria-label={t("feature.specifications")} onClick={onClick}>
      <div className="ttl">{t("feature.specifications")}</div>
      <GateTabs f={f} current={area} />
      {run && (
        <div className="banner run">
          <span className="ring" />
          <span className="grow">{t(run.waitingLock ? "writer.run.waiting" : run.mode === "impact" ? "writer.run.checking" : "writer.run.working")}</span>
        </div>
      )}
      {blocked && (
        <BlockedBanner title={t(noAgent ? "writer.run.noAgent" : "writer.run.failed")} reason={noAgent ? t(me.globalAdmin ? "writer.run.noAgentAdmin" : "writer.run.noAgentHint") : f.workflow?.lastError}>
          {noAgent && me.globalAdmin && <Link className="btn sm" to={adminPath("nabu")}>{t("writer.run.configure")}</Link>}
          {f.permissions.retry && <button className="btn sm" disabled={busy} onClick={onRetry}>{t("writer.run.retry")}</button>}
        </BlockedBanner>
      )}
      {skipped && <div className="actionbar"><span className="st none">{t("writer.skipped")}</span><span className="grow ab-grow">{t("writer.skippedHint")}</span></div>}
      {gate && <ActionBar f={f} gate={gate} busy={busy} onSubmit={onSubmit} onApprove={onApprove} onAdvance={onAdvance} onHistory={() => onDialog({ kind: "history", area: gate.area })} />}
      {area && f.phase === "spec" && <SpecQuestions featureKey={f.uniqueId} area={area} highlighted={highlighted} />}
      {area && gate ? (
        <GateView featureId={f.uniqueId} area={area}>
          <DocumentPane key={`${f.uniqueId}-${area}`} feature={f} area={area} />
        </GateView>
      ) : !skipped && (f.openQuestions[area as Area] ?? 0) === 0 && (
        <Empty icon="files" title={t("feature.noGate")} />
      )}
      {(area === "product" || area === "arch") && gate && <SpecChanges featureKey={f.uniqueId} area={area} />}
    </section>
  );
}

/** The gates of the feature, a level under the stages (FTR.HMR.DEV-0001 R28). */
function GateTabs({ f, current }: { f: FeatureCard; current?: Area }) {
  const { t } = useTranslation();
  const byArea = new Map(f.gates.map((g) => [g.area, g]));
  return (
    <div className="gtabs" role="tablist" aria-label={t("feature.specifications")}>
      {AREAS.map((a) => {
        const g = byArea.get(a);
        const skipped = f.skippedAreas.includes(a);
        const open = f.openQuestions[a] ?? 0;
        const running = f.writerRun?.state === "generating" && f.writerRun.areas.includes(a);
        const reachable = !!g || skipped || open > 0 || running;
        const state = running ? "running" : skipped ? "skipped" : g ? (f.approvalRequired ? g.status : "none") : "later";
        const stateText = t(`writer.gate.${state}`);
        const name = t(`areas.${a}`);
        const label = open > 0 ? t("writer.gate.label", { name, state: stateText, count: open }) : `${name}, ${stateText}`;
        const inner = (
          <>
            <span className="gico"><Icon name={GATE_ICONS[a]} size={20} /></span>
            <span className="lb">{name}</span>
            {!reachable || skipped ? null : <i className={`dot ${state}`} aria-hidden="true" />}
            {a !== "product" && (a === "tech" || a === "qa") && <span className="ag"><AgentMark /></span>}
            {open > 0 && <span className="cnt">{open}</span>}
          </>
        );
        const cls = `g${a === current ? " on" : ""}${skipped ? " skip" : ""}${reachable ? "" : " fut"}`;
        return reachable
          ? <NavLink key={a} role="tab" aria-selected={a === current} aria-label={label} title={name} className={() => cls} to={`/features/${f.uniqueId}/spec/${a}`}>{inner}</NavLink>
          : <span key={a} role="tab" aria-disabled="true" aria-selected="false" aria-label={label} title={t("writer.gate.laterHint")} className={cls}>{inner}</span>;
      })}
    </div>
  );
}

// ─── Action bar ───────────────────────────────────────────────

function ActionBar({ f, gate, onSubmit, onApprove, onAdvance, onHistory, busy }: {
  f: FeatureCard; gate: Gate; onSubmit: () => void; onApprove: () => void; onAdvance: () => void; onHistory: () => void; busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const canSubmit = f.permissions.submit.includes(gate.area);
  const canApprove = f.permissions.approve.includes(gate.area);
  const running = !!f.writerRun?.areas.includes(gate.area);
  // FTR.HMR.DEV-0001 R21: the order of approval stays strict: the reason is seen before a click
  const before = AREAS.slice(0, AREAS.indexOf(gate.area)).find((a) => f.gates.some((g) => g.area === a && g.status !== "approved"));
  const waits = canApprove && !!before;
  // FTR.HMR.DEV-0002 R3: wrong rows of "Changes to other features" stop the submission and the next stage
  // (the next stage aligns the notes from any gate; the submission — only of product)
  // FTR.HMR.DEV-0003 R12: the section of arch too
  const submitChecked = (gate.area === "product" || gate.area === "arch") && canSubmit;
  const rows = useChangesInvalid(f.uniqueId, (gate.area === "product" && canSubmit) || f.permissions.advance,
    (gate.area === "arch" && canSubmit) || f.permissions.advance);
  // the submission is checked by the section of its own gate, the next stage by both
  const submitInvalid = (gate.area === "product" && rows.product) || (gate.area === "arch" && rows.arch);
  const invalid = submitInvalid || (f.permissions.advance && (rows.product || rows.arch));
  const invalidHint = invalid ? t("spec.changes.fixFirst") : undefined;
  let text: React.ReactNode;
  if (running) text = <span className="wait"><Icon name="lock" size={14} />{t("writer.readOnly")}</span>;
  else if (invalid && (submitChecked || f.permissions.advance)) text = <span className="wait"><Icon name="lock" size={14} />{invalidHint}</span>;
  else if (waits) text = <span className="wait"><Icon name="lock" size={14} />{t("writer.waitsFor", { area: t(`areas.${before}`) })}</span>;
  else if (!f.approvalRequired) text = t("feature.bar.noApproval");
  else if (gate.status === "in_review") text = t("feature.bar.inReview", { when: gate.submittedAt ? relativeTime(gate.submittedAt, i18n.language) : "" });
  else if (gate.status === "approved") text = t("feature.bar.approved", { name: gate.approvedBy ?? "", when: gate.approvedAt ? relativeTime(gate.approvedAt, i18n.language) : "" });
  else if (gate.approvedCommit) text = t("feature.bar.draftAfterApproval");
  else text = t("feature.bar.draft");
  return (
    <div className="actionbar">
      <StatusBadge status={gate.status} approvalRequired={f.approvalRequired} />
      <span className="grow ab-grow">{text}</span>
      <Link className="btn sm" to={`/features/${f.uniqueId}/spec/${gate.area}/diff`}>{t("feature.viewChanges")}</Link>
      <button className="btn sm" onClick={onHistory}>{t("feature.history")}</button>
      {f.permissions.advance && <button className="btn primary sm abmain" disabled={busy || !!f.writerRun || rows.product || rows.arch} title={rows.product || rows.arch ? invalidHint : undefined} onClick={onAdvance}>{t("writer.advance")}</button>}
      {canSubmit && <button className="btn primary sm abmain" disabled={busy || (submitChecked && submitInvalid)} title={submitChecked && submitInvalid ? invalidHint : undefined} onClick={onSubmit}>{t("feature.submit")}</button>}
      {canApprove && <button className="btn ok sm" disabled={busy || waits} onClick={onApprove}><Icon name="check" size={15} />{t("feature.approve")}</button>}
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
