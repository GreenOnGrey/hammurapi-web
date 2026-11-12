import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateFeature, useFeatureCost, useImplementation } from "../../api/queries";
import type { TFunction } from "i18next";
import type { FeatureCard, PRDTO, RequirementRow, ServiceImpl, TaskDTO, TaskCheck } from "../../api/types";
import { errorText } from "../../lib/errors";
import { useSession } from "../../app/session";
import { AutonomyModal } from "./Autonomy";
import { CostButton } from "./Cost";
import { useRunLog, type LogRun } from "./RunLog";
import { dateTime } from "../../lib/format";

import { Empty, Icon, Loading, Markdown, useToast } from "@green-on-grey/ui-kit";
import { AgentMark, Dot } from "../../components/cycle";
import { BlockedBanner } from "../../components/BlockedBanner";

/** Implementation tab (R21): PRs by service with CI and review, and the traceability matrix. */
export function ImplementationTab({ f }: { f: FeatureCard }) {
  const { t, i18n } = useTranslation();
  const impl = useImplementation(f.uniqueId);
  if (impl.isLoading) return <Loading />;
  const d = impl.data;
  if (!d) return null;
  const nothing = d.services.length === 0 && d.matrix.length === 0;
  return (
    <>
      {d.workflow?.state === "blocked" && <BlockedBanner title={t("impl.blocked")} reason={d.workflow.lastError} />}
      {d.workflow?.step === "waiting_human_pr" && <div className="banner info"><Icon name="clock" /><span className="grow">{t("impl.waitingHumanPr")}</span></div>}
      {f.phase !== "released" && f.phase !== "spec" && (
        <div className="banner info"><Icon name="merge" /><span className="grow">{t("impl.notMerged")}</span></div>
      )}
      {nothing && <Empty icon="code" title={t("impl.empty")}>{f.phase === "spec" ? t("impl.emptyHint") : ""}</Empty>}
      {d.services.map((s) => <ServiceCard key={s.service} f={f} s={s} />)}
      {d.humanPrs.length > 0 && (
        <section className="svc">
          <div className="h"><b>{t("impl.humanPrs")}</b></div>
          {d.humanPrs.map((pr) => <PRRow key={pr.id} pr={pr} />)}
        </section>
      )}
      {d.matrix.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="group-h">{t("impl.matrix")}</h3>
          <Matrix rows={d.matrix} />
        </section>
      )}
      {(d.tokensIn + d.tokensOut) > 0 && (
        <p className="small muted">{t("impl.tokens", { n: (d.tokensIn + d.tokensOut).toLocaleString(i18n.language) })}</p>
      )}
    </>
  );
}

function ServiceCard({ f, s }: { f: FeatureCard; s: ServiceImpl }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const latest = s.tasks[0];
  const { owns } = useSession();
  const [autonomy, setAutonomy] = useState(false);
  // The attempt a retry was accepted for — the task and its end: the button stays off until another attempt ends,
  // a new task or the same task again after «Повторить коммит» (it clears finished_at and sets it at the next end).
  const [retried, setRetried] = useState<string | null>(null);
  const attempt = (x: Pick<TaskDTO, "id" | "finishedAt">) => `${x.id}@${x.finishedAt ?? ""}`;
  // FTR.HMR.DEV-0004 R12–R14: «Повторить коммит» repeats the steps of Hammurapi, the other retries run the agent again
  const retry = useMutation({
    mutationFn: ({ task, commit }: { task: TaskDTO; commit: boolean }) =>
      api.post(`/api/v1/features/${f.uniqueId}/codegen/tasks/${task.id}/${commit ? "retry-commit" : "retry"}`),
    onSuccess: (_, { task }) => {
      setRetried(attempt(task));
      invalidateFeature(qc, f.uniqueId);
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const cost = useFeatureCost(f.uniqueId);
  const openLog = useRunLog();
  const runs: LogRun[] = s.tasks.filter((x) => x.nabuRunId).map((x, i, all) => ({
    runId: x.nabuRunId!,
    label: t("log.runOf", { n: all.length - i, total: all.length, at: dateTime(x.startedAt ?? x.createdAt, i18n.language), status: t(`task.status.${x.status}`) }),
  }));
  const retryLabel = latest?.retry === "commit" ? t("task.retryCommit") : latest?.retry === "rerun" ? t("task.rerunAgent") : t("task.retry");
  return (
    <section className="svc">
      <div className="h">
        <Icon name="server" size={16} />
        <b>{s.service}</b>
        <span className="mono small muted">{s.repo}</span>
        <span className="grow" />
        {owns(s.service)
          ? <button className="btn ghost sm" onClick={() => setAutonomy(true)}>{t(`autonomy.${s.autonomy}.name`)}</button>
          : <span className="st none">{t(`autonomy.${s.autonomy}.name`)}</span>}
      </div>
      {autonomy && <AutonomyModal service={{ key: s.service, autonomy: s.autonomy, check: s.check }} onClose={() => setAutonomy(false)} />}
      {latest && (
        <div className="row small" style={{ marginBottom: 6 }}>
          <AgentMark />
          <span className={`st ${latest.status === "failed" ? "blocked" : latest.status === "succeeded" ? "approved" : "disc"}`}>{t(`task.status.${latest.status}`)}</span>
          {/* FTR.HMR.DEV-0004 R1: the stage names the generation; other kinds of a task keep their label */}
          {latest.type !== "implement" && <span className="t2">{t(`task.type.${latest.type}`)}</span>}
          {latest.status === "running" && <><span className="ring" /><span className="t2">{latest.progress ?? t("task.working")}</span></>}
          {latest.error && <span className="err-text" style={{ margin: 0 }}>{taskError(t, latest)}</span>}
          {/* FTR.HMR.DEV-0004 R1, R4, R8, R10: the cost of the service and the log of the task, for its experts */}
          <CostButton featureId={f.uniqueId} subject={{ kind: "service", key: s.service }} />
          {cost.data?.canViewLog && latest.nabuRunId && (
            <button className="btn ghost sm" title={latest.status === "running" ? t("log.openLive") : t("log.open")}
              aria-label={latest.status === "running" ? t("log.openLive") : t("log.open")}
              onClick={() => openLog({ runId: latest.nabuRunId!, runs, title: s.service })}>
              <Icon name="terminal" size={16} />
            </button>
          )}
          {(latest.status === "failed" || latest.status === "cancelled") && (
            <button className="btn sm" disabled={retry.isPending || retried === attempt(latest)} title={latest.retry === "commit" ? t("task.retryCommitHint") : undefined}
              onClick={() => retry.mutate({ task: latest, commit: latest.retry === "commit" })}>{retryLabel}</button>
          )}
        </div>
      )}
      {latest?.result?.check && <CheckBadge check={latest.result.check} />}
      {latest?.result?.warnings?.map((w) => <div key={w} className="banner warn small"><Icon name="alert" /><span className="grow">{w}</span></div>)}
      {s.plan && (
        <details className="docsec" open={!s.pr}>
          <summary><b>{t("impl.plan")}</b> <span className="small muted">{t("impl.planHint")}</span></summary>
          <Markdown text={s.plan} />
        </details>
      )}
      {s.pr ? <PRRow pr={s.pr} /> : <div className="small muted">{t("impl.noPr")}</div>}
    </section>
  );
}

const CHECK_TONE: Record<string, string> = { passed: "approved", failed: "blocked", unavailable: "disc", unverified: "draft" };

/** The readiness check of a task (FTR.HMR.CMN-0008 R18, design §3.3): no badge when nothing changed. */
export function CheckBadge({ check }: { check: TaskCheck }) {
  const { t } = useTranslation();
  if (check.status === "not_run") return null;
  const label = <span className={`st ${CHECK_TONE[check.status]}`}>{t(`task.check_${check.status}`)}</span>;
  if (check.status === "unverified") return <div className="row small" style={{ marginBottom: 6 }}>{label}</div>;
  return (
    <details className="small" style={{ marginBottom: 6 }}>
      <summary>{label} <span className="mono t2">{check.command}</span></summary>
      <div className="t2">{t("task.checkAttempts", { attempts: check.attempts, max: check.maxAttempts })}</div>
      {check.outputTail && <pre className="mono small">{check.outputTail}</pre>}
    </details>
  );
}

export function PRRow({ pr }: { pr: PRDTO }) {
  const { t } = useTranslation();
  const ci = pr.ciStatus ?? "pending";
  return (
    <div className="pr">
      <Icon name={pr.state === "merged" ? "merge" : "branch"} size={16} />
      <a href={pr.url} target="_blank" rel="noreferrer" className="ellipsis">
        #{pr.number} {pr.title || pr.branch} {pr.byAgent ? <AgentMark /> : <span className="tag-fix">{t("impl.byHuman")}</span>}
      </a>
      <span className={`st ${ci === "success" ? "approved" : ci === "failure" ? "blocked" : "draft"}`}>CI: {t(`ci.${ci}`, { defaultValue: ci })}</span>
      <span className={`st ${pr.state === "merged" ? "handed" : pr.review === "approved" || pr.review === "not_required" ? "approved" : pr.review === "changes_requested" ? "blocked" : "in_review"}`}>
        {pr.state === "open" ? t(`review.${pr.review}`) : t(`prState.${pr.state}`)}
      </span>
    </div>
  );
}

export function Matrix({ rows }: { rows: RequirementRow[] }) {
  const { t } = useTranslation();
  return (
    <div className="cov-wrap">
      <table className="cov">
        <thead><tr><th>{t("impl.requirement")}</th><th>{t("impl.services")}</th><th>{t("impl.testCases")}</th><th>PR</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const gap = r.testCases.length === 0 || r.prs.length === 0;
            const tone = r.testCases.length && r.prs.length ? "g" : r.testCases.length || r.prs.length ? "a" : "r";
            return (
              <tr key={r.id} className={gap ? "gap" : undefined}>
                <td><Dot tone={tone} /><b>{r.id}</b> <span className="t2">{r.text}</span></td>
                <td className="small cov-svc">
                  {r.services.length ? r.services.map((s, i) => <Fragment key={s}>{i > 0 && ", "}<span>{s}</span></Fragment>) : "—"}
                </td>
                <td className="small mono cov-tc">
                  {r.testCases.length === 0 && <span className="err-text">{t("impl.noTest")}</span>}
                  {/* FTR.HMR.SPEC-0005 R6: the services a case is marked with */}
                  {r.testCases.map((c, i) => (
                    // the separator stays outside the case: the list breaks between cases, never inside one
                    <Fragment key={c.id}>
                      {i > 0 && ", "}
                      <span className="tc-ref">{c.id}{c.services?.map((s) => <span key={s} className="tc-svc">{s}</span>)}</span>
                    </Fragment>
                  ))}
                </td>
                <td className="small cov-pr">
                  {r.prs.length ? r.prs.map((p) => <Fragment key={p.url}>{" "}<a href={p.url} target="_blank" rel="noreferrer">{p.service} #{p.number}</a></Fragment>) : <span className="err-text cov-none">{t("impl.noPrShort")}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The text of a failed code task: by its class when known (FTR.HMR.CMN-0007 R11). */
export function taskError(t: TFunction, task: Pick<TaskDTO, "error" | "errorClass">): string {
  if (!task.errorClass) return task.error ?? "";
  return t(`task.error.${task.errorClass}`, { defaultValue: task.error ?? "", text: task.error ?? "" });
}
