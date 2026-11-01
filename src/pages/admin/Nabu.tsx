import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nabuAdminKey, useNabuSettings } from "./nabuSettings";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { NabuScenarioRow, NabuSettingsView } from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime } from "../../lib/format";
import { Icon, Loading, useToast } from "@green-on-grey/ui-kit";

// FTR.HMR.CMN-0006 R8, tech §3.3: the connection to Nabu and the binding
// "scenario → service agent of Nabu". FTR.HMR.CMN-0007 R4, design §3.6: an
// unbound scenario does not run; a code agent needs the sandbox of Nabu.

/** The warning of a scenario row: not bound, or a code agent without the sandbox of Nabu.
 * The rows and which of them change code come from the core (scenarioRows). */
export function scenarioWarning(row: NabuScenarioRow, agent: string | undefined, agents: NabuSettingsView["agents"]): "unbound" | "noSandbox" | null {
  if (!agent) return "unbound";
  const a = agents.find((x) => x.name === agent);
  if (row.code && a && a.workspace !== "nabu") return "noSandbox";
  return null;
}

export function NabuAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const view = useNabuSettings();
  const bind = useMutation({
    mutationFn: (body: Record<string, string | null>) => api.put<NabuSettingsView>("/admin/api/v1/nabu/scenarios", body),
    onSuccess: (v) => {
      qc.setQueryData(nabuAdminKey, v);
      toast({ kind: "ok", title: t("admin.nabu.saved") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (view.isLoading) return <Loading />;
  if (view.error) return <div className="err-text">{errorText(t, view.error)}</div>;
  const v = view.data!;
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.nabu.title")}</h1>
      <p className="t2" style={{ marginTop: 6 }}>{t("admin.nabu.intro")}</p>

      {!v.connected && (
        <div className="banner err-banner" style={{ marginTop: 16 }} role="alert">
          <Icon name="alert" />
          <span className="grow">
            {t("admin.nabu.down")}
            <span className="small muted" style={{ display: "block" }}>
              {v.lastOkAt ? t("admin.nabu.lastOk", { at: dateTime(v.lastOkAt, i18n.language) }) : t("admin.nabu.neverOk")}
            </span>
          </span>
          <button className="btn sm" disabled={view.isFetching} onClick={() => view.refetch()}>{t("admin.nabu.recheck")}</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="sec">{t("admin.nabu.connection")}</h3>
        <dl className="nabu-conn">
          <dt>{t("admin.nabu.url")}</dt><dd className="mono">{v.url}</dd>
          <dt>{t("admin.nabu.client")}</dt><dd className="mono">{v.client}</dd>
          <dt>{t("admin.nabu.status")}</dt>
          <dd>
            {v.connected
              ? <><span className="sdot g" />{t("admin.nabu.connected")}</>
              : <span title={v.error}><span className="sdot r" />{t("admin.nabu.unreachable")}</span>}
          </dd>
        </dl>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="sec">{t("admin.nabu.scenarios")}</h3>
        <p className="small muted nabu-hint">{t("admin.nabu.scenariosHint")}</p>
        <p className="small muted nabu-hint">{t("admin.nabu.codeHint")}</p>
        <table className="t nabu-scenarios">
          <thead><tr><th>{t("admin.nabu.scenario")}</th><th>{t("admin.nabu.agent")}</th></tr></thead>
          <tbody>
            {(v.scenarioRows ?? []).map((row) => (
              <tr key={row.name}>
                <td>{t(`llm.scenario.${row.name}`)}</td>
                <td>
                  <select className="inp" value={v.scenarios[row.name] ?? ""} disabled={!v.connected || bind.isPending}
                    aria-label={t(`llm.scenario.${row.name}`)} onChange={(e) => bind.mutate({ [row.name]: e.target.value || null })}>
                    <option value="">{t("admin.nabu.notBound")}</option>
                    {v.agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    {v.scenarios[row.name] && !v.agents.some((a) => a.name === v.scenarios[row.name]) && (
                      <option value={v.scenarios[row.name]}>{v.scenarios[row.name]}</option>
                    )}
                  </select>
                  {(() => {
                    const w = scenarioWarning(row, v.scenarios[row.name], v.agents);
                    return w && <div className="small scenario-warn"><Icon name="alert" size={14} /> {t(`admin.nabu.${w}`)}</div>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
