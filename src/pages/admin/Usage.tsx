import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, qs } from "../../api/client";
import { keys } from "../../api/queries";
import type { UsageReport } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Loading } from "@green-on-grey/ui-kit";

// The usage of agents (FTR.HMR.CMN-0007 R3): the agent lives in Nabu, the
// history of its runs stays here for reports.

const BASE = "/admin/api/v1/agent";

// ─── usage ───────────────────────────────────────────────────────────

// Usage recorded before FTR.HMR.CMN-0004 has no scenario, only its old context.
const LEGACY_CONTEXT: Record<string, string> = {
  discovery: "stages.research", gate: "llm.scenario.gate_generation", check: "llm.scenario.conformance_check",
  task: "llm.scenario.codegen", codegen: "llm.scenario.codegen",
};

function usageLabel(t: TFunction, key: string): string {
  if (LEGACY_CONTEXT[key]) return t(LEGACY_CONTEXT[key]);
  return t(`llm.scenario.${key}`, { defaultValue: key });
}

const PERIODS = { day: 1, week: 7, month: 30 } as const;
type Period = keyof typeof PERIODS;

function rangeOf(p: Period) {
  const to = new Date();
  return { from: new Date(to.getTime() - PERIODS[p] * 86400_000).toISOString(), to: to.toISOString() };
}

export function AgentUsageAdmin() {
  const { t, i18n } = useTranslation();
  const [period, setPeriodState] = useState<Period>("week");
  const [range, setRange] = useState(() => rangeOf("week"));
  const setPeriod = (p: Period) => { setPeriodState(p); setRange(rangeOf(p)); };
  const byScenario = useQuery({
    queryKey: keys.agentUsage(`${period}:scenario`),
    queryFn: () => api.get<UsageReport>(`${BASE}/usage${qs({ ...range, groupBy: "scenario" })}`),
  });
  const byModel = useQuery({
    queryKey: keys.agentUsage(`${period}:connection,model`),
    queryFn: () => api.get<UsageReport>(`${BASE}/usage${qs({ ...range, groupBy: "connection,model" })}`),
  });
  const nf = new Intl.NumberFormat(i18n.language);
  const usd = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
  const tot = byScenario.data?.totals;
  const tokens = tot ? tot.tokensIn + tot.tokensOut : 0;
  const cacheShare = tot && tot.tokensIn > 0 ? Math.round((tot.cacheRead / tot.tokensIn) * 100) : 0;
  const maxCost = Math.max(0, ...(byScenario.data?.rows ?? []).map((r) => r.costUsd));
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.agent.usage.title")}</h1>
      <div className="seg" role="group" aria-label={t("admin.agent.usage.period")}>
        {(Object.keys(PERIODS) as Period[]).map((p) => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`admin.agent.usage.${p}`)}</button>)}
      </div>
      {byScenario.isLoading && <Loading />}
      {byScenario.error && <div className="err-text">{errorText(t, byScenario.error)}</div>}
      {tot && (
        <div className="kpi">
          <div><b>{usd.format(tot.costUsd)}</b><span>{t("admin.agent.usage.cost")}</span></div>
          <div><b>{nf.format(tokens)}</b><span>{t("admin.agent.usage.tokens")}</span></div>
          <div><b>{cacheShare}%</b><span>{t("admin.agent.usage.cache")}</span></div>
          <div><b>{nf.format(tot.runs)}</b><span>{t("admin.agent.usage.runs")}</span></div>
        </div>
      )}
      {byScenario.data && byScenario.data.rows.length > 0 && (
        <div className="usagebars">
          {byScenario.data.rows.map((r) => (
            <div key={r.key.scenario}>
              <span>{usageLabel(t, r.key.scenario)}</span>
              <div className="bar"><i style={{ width: `${maxCost > 0 ? (r.costUsd / maxCost) * 100 : 0}%` }} /></div>
              <span className="mono small">{usd.format(r.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
      <table className="t" style={{ marginTop: 16 }}>
        <thead><tr>
          <th>{t("admin.agent.usage.connection")}</th><th>{t("admin.agent.usage.model")}</th>
          <th className="num">{t("admin.agent.usage.in")}</th><th className="num">{t("admin.agent.usage.out")}</th><th className="num">{t("admin.agent.usage.cost")}</th>
        </tr></thead>
        <tbody>
          {byModel.data?.rows.map((r) => (
            <tr key={`${r.key.connection}|${r.key.model}`}>
              <td>{r.key.connection || "—"}</td><td className="mono small">{r.key.model || "—"}</td>
              <td className="num">{nf.format(r.tokensIn)}</td><td className="num">{nf.format(r.tokensOut)}</td><td className="num">{usd.format(r.costUsd)}</td>
            </tr>
          ))}
          {byModel.data && byModel.data.rows.length === 0 && <tr><td colSpan={5} className="small muted">{t("admin.agent.usage.empty")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
