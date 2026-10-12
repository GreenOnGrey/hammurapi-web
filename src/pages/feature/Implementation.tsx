import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateFeature, useImplementation } from "../../api/queries";
import type { FeatureCard, PRDTO, RequirementRow, ServiceImpl } from "../../api/types";
import { errorText } from "../../lib/errors";
import { useSession } from "../../app/session";
import { AutonomyModal } from "./Autonomy";

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
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/features/${f.uniqueId}/codegen/tasks/${id}/retry`),
    onSuccess: () => invalidateFeature(qc, f.uniqueId),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
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
      {autonomy && <AutonomyModal service={{ key: s.service, autonomy: s.autonomy }} onClose={() => setAutonomy(false)} />}
      {latest && (
        <div className="row small" style={{ marginBottom: 6 }}>
          <AgentMark />
          <span className={`st ${latest.status === "failed" ? "blocked" : latest.status === "succeeded" ? "approved" : "disc"}`}>{t(`task.status.${latest.status}`)}</span>
          <span className="t2">{t(`task.type.${latest.type}`)}</span>
          {latest.status === "running" && <><span className="ring" /><span className="t2">{latest.progress ?? t("task.working")}</span></>}
          {latest.error && <span className="err-text" style={{ margin: 0 }}>{latest.error}</span>}
          {(latest.tokensIn + latest.tokensOut) > 0 && <span className="muted">{t("common.tokens", { n: (latest.tokensIn + latest.tokensOut).toLocaleString(i18n.language) })}</span>}
          {(latest.status === "failed" || latest.status === "cancelled") && (
            <button className="btn sm" disabled={retry.isPending} onClick={() => retry.mutate(latest.id)}>{t("task.retry")}</button>
          )}
        </div>
      )}
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
    <table className="cov">
      <thead><tr><th>{t("impl.requirement")}</th><th>{t("impl.services")}</th><th>{t("impl.testCases")}</th><th>PR</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const gap = r.testCases.length === 0 || r.prs.length === 0;
          const tone = r.testCases.length && r.prs.length ? "g" : r.testCases.length || r.prs.length ? "a" : "r";
          return (
            <tr key={r.id} className={gap ? "gap" : undefined}>
              <td><Dot tone={tone} /><b>{r.id}</b> <span className="t2">{r.text}</span></td>
              <td className="small">{r.services.join(", ") || "—"}</td>
              <td className="small mono">{r.testCases.map((c) => c.id).join(", ") || <span className="err-text">{t("impl.noTest")}</span>}</td>
              <td className="small">
                {r.prs.length ? r.prs.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer">{p.service} #{p.number} </a>) : <span className="err-text">{t("impl.noPrShort")}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
