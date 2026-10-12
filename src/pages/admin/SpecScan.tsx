import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type {
  List,
  SpecIndexIssue,
  SpecScanInterval,
  SpecScanRun,
  SpecScanSettings,
} from "../../api/types";
import { SPEC_SCAN_INTERVALS } from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime, duration } from "../../lib/format";
import { Icon, Loading, useToast } from "@green-on-grey/ui-kit";
import { adminPath } from "./paths";

/** The check of the specification repository in Settings (FTR.HMR.CMN-0005 R1,
 * R3, R5, R7): period, "Check now", the last run and the indexing problems. */
export function SpecScanSection() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: keys.specScanSettings,
    queryFn: () =>
      api.get<SpecScanSettings>("/admin/api/v1/spec-scan/settings"),
  });
  const runs = useQuery({
    queryKey: keys.specScanRuns,
    queryFn: () =>
      api.get<List<SpecScanRun>>("/admin/api/v1/spec-scan/runs?limit=5"),
    // While a check is queued or running, follow it.
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (r) => r.status === "queued" || r.status === "running",
      )
        ? 3000
        : false,
  });
  const issues = useQuery({
    queryKey: keys.specScanIssues,
    queryFn: () =>
      api.get<{ items: SpecIndexIssue[] }>("/admin/api/v1/spec-scan/issues"),
  });
  const [interval, setIv] = useState<SpecScanInterval | "">("");
  const save = useMutation({
    mutationFn: () =>
      api.put<SpecScanSettings>("/admin/api/v1/spec-scan/settings", {
        interval: interval || settings.data?.interval,
      }),
    onSuccess: (s) => {
      qc.setQueryData(keys.specScanSettings, s);
      toast({ kind: "ok", title: t("admin.settings.saved") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const now = useMutation({
    mutationFn: () =>
      api.post<{ runId: string }>("/admin/api/v1/spec-scan/runs"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.specScanRuns });
      toast({ kind: "ok", title: t("specScan.queued") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (settings.isLoading) return <Loading />;
  const last = runs.data?.items.find(
    (r) => r.status === "succeeded" || r.status === "failed",
  );
  const pending = runs.data?.items.find(
    (r) => r.status === "queued" || r.status === "running",
  );
  const open = issues.data?.items ?? [];
  const deleted = open.filter((i) => i.kind === "deleted");
  const problems = open.filter((i) => i.kind !== "deleted");
  const current = interval || settings.data?.interval || "1h";
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17 }}>{t("specScan.title")}</h2>
      <p className="small t2">{t("specScan.hint")}</p>
      <div
        className="row"
        style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="scan-iv">{t("specScan.interval")}</label>
          <select
            id="scan-iv"
            className="inp"
            value={current}
            onChange={(e) => setIv(e.target.value as SpecScanInterval)}
          >
            {SPEC_SCAN_INTERVALS.map((v) => (
              <option key={v} value={v}>
                {t(`specScan.every.${v}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t("specScan.branch")}</label>
          <div className="mono" style={{ padding: "8px 0" }}>
            {settings.data?.branch}
          </div>
        </div>
        <button
          className="btn primary sm"
          disabled={
            !interval || interval === settings.data?.interval || save.isPending
          }
          onClick={() => save.mutate()}
        >
          {t("common.save")}
        </button>
        <button
          className="btn sm"
          disabled={now.isPending || !!pending}
          onClick={() => now.mutate()}
        >
          <Icon name="refresh" size={14} />
          {pending
            ? t(`specScan.status.${pending.status}`)
            : t("specScan.checkNow")}
        </button>
      </div>
      {last && (
        <div className="kpi">
          <div>
            <b>
              {last.startedAt ? dateTime(last.startedAt, i18n.language) : "—"}
            </b>
            <span>
              {t("specScan.lastRun")}
              {last.durationMs !== null &&
                ` · ${t("specScan.ms", { ms: last.durationMs })}`}
            </span>
          </div>
          <div>
            <b>{last.found ?? "—"}</b>
            <span>{t("specScan.found")}</span>
          </div>
          <div>
            <b>{last.indexed ?? "—"}</b>
            <span>{t("specScan.indexed")}</span>
          </div>
          <div>
            <b className={last.issues ? "err" : undefined}>
              {last.issues ?? "—"}
            </b>
            <span>{t("specScan.issues")}</span>
          </div>
        </div>
      )}
      {last?.status === "failed" && (
        <div className="banner warn">
          <Icon name="alert" />
          <span className="grow">
            {t("specScan.failed", { error: last.error ?? "" })}
          </span>
        </div>
      )}

      <h3 style={{ fontSize: 15, marginTop: 18 }}>{t("specScan.problems")}</h3>
      {problems.length === 0 ? (
        <div className="small muted">{t("specScan.noProblems")}</div>
      ) : (
        <table className="t">
          <thead>
            <tr>
              <th>{t("specScan.path")}</th>
              <th>{t("specScan.reason")}</th>
              <th>{t("specScan.since")}</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((i) => (
              <tr key={i.id}>
                <td className="mono small">{i.path}</td>
                <td className="small">
                  <IssueReason issue={i} />
                </td>
                <td className="small muted">
                  {duration(i.firstSeenAt, i18n.language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {deleted.length > 0 && (
        <div
          className="banner warn"
          style={{ marginTop: 14, flexDirection: "column", gap: 4 }}
        >
          <b>{t("specScan.deletedTitle")}</b>
          <span className="small">{t("specScan.deletedHint")}</span>
          {deleted.map((i) => (
            <span key={i.id} className="mono small">
              {i.featureKey} — {i.path}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** The reason always says what to do (design §4). */
export function IssueReason({ issue }: { issue: SpecIndexIssue }) {
  const { t } = useTranslation();
  const d = issue.details as Record<string, string | string[] | undefined>;
  switch (issue.kind) {
    case "old_format":
      return (
        <>{t("specScan.kind.old_format", { suggested: d.suggested ?? "" })}</>
      );
    case "key_path_mismatch":
      return (
        <>
          {t("specScan.kind.key_path_mismatch", {
            id: (d.id as string[] | undefined)?.join(".") ?? "",
            path: (d.path as string[] | undefined)?.join("/") ?? "",
          })}
        </>
      );
    case "missing_domain":
    case "missing_system":
      return (
        <>
          {t(`specScan.kind.${issue.kind}`, {
            domain: d.domain ?? "",
            system: d.system ?? "",
          })}{" "}
          <Link to={adminPath("domains")}>{t("specScan.add")}</Link>
        </>
      );
    case "missing_parent":
      return (
        <>{t("specScan.kind.missing_parent", { parent: d.parent ?? "" })}</>
      );
    default:
      return <>{t(`specScan.kind.${issue.kind}`)}</>;
  }
}
