import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { NabuSettingsView } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon } from "../../components/Icon";
import { Loading, Modal, useToast } from "../../components/ui";

// FTR.HMR.CMN-0006 R8, R11, tech §3.3, §4: the connection to Nabu, the binding
// "scenario → service agent of Nabu" and the transfer of the agent settings.

export const SERVICE_SCENARIOS = ["issue_analysis", "gate_generation", "conformance_check", "codegen", "review_update", "rollback_revert"] as const;

export const nabuAdminKey = ["admin", "nabu"] as const;

export function useNabuSettings(enabled = true) {
  return useQuery({
    queryKey: nabuAdminKey,
    queryFn: () => api.get<NabuSettingsView>("/admin/api/v1/nabu"),
    enabled,
    staleTime: 30_000,
  });
}

export function NabuAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const view = useNabuSettings();
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<{ serviceAgents?: Record<string, string>; skipped?: unknown[] } | null>(null);
  const bind = useMutation({
    mutationFn: (body: Record<string, string | null>) => api.put<NabuSettingsView>("/admin/api/v1/nabu/scenarios", body),
    onSuccess: (v) => {
      qc.setQueryData(nabuAdminKey, v);
      toast({ kind: "ok", title: t("admin.nabu.saved") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const migrate = useMutation({
    mutationFn: () => api.post<{ serviceAgents?: Record<string, string>; skipped?: unknown[] }>("/admin/api/v1/nabu/migrate"),
    onSuccess: (r) => {
      setReport(r);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: nabuAdminKey });
    },
  });
  if (view.isLoading) return <Loading />;
  if (view.error) return <div className="err-text">{errorText(t, view.error)}</div>;
  const v = view.data!;
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.nabu.title")}</h1>
      <p className="t2" style={{ marginTop: 6 }}>{t("admin.nabu.intro")}</p>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="sec">{t("admin.nabu.connection")}</h2>
        {!v.url ? (
          <p className="small muted">{t("admin.nabu.notConfigured")}</p>
        ) : (
          <div>
            <div className="line"><span>{t("admin.nabu.url")}</span><span className="mono">{v.url}</span></div>
            <div className="line"><span>{t("admin.nabu.client")}</span><span className="mono">{v.client}</span></div>
            <div className="line">
              <span>{t("admin.nabu.status")}</span>
              {v.connected
                ? <span className="nowrap"><span className="dot g" />{t("admin.nabu.connected")}</span>
                : <span className="nowrap" title={v.error}><span className="dot r" />{t("admin.nabu.unreachable")}</span>}
            </div>
          </div>
        )}
      </div>

      {v.url && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="sec">{t("admin.nabu.scenarios")}</h2>
          <p className="small muted">{t("admin.nabu.scenariosHint")}</p>
          <table className="t">
            <thead><tr><th>{t("admin.nabu.scenario")}</th><th>{t("admin.nabu.agent")}</th></tr></thead>
            <tbody>
              {SERVICE_SCENARIOS.map((sc) => (
                <tr key={sc}>
                  <td>{t(`llm.scenario.${sc}`)}</td>
                  <td>
                    <select className="inp" value={v.scenarios[sc] ?? ""} disabled={!v.connected || bind.isPending}
                      aria-label={t(`llm.scenario.${sc}`)} onChange={(e) => bind.mutate({ [sc]: e.target.value || null })}>
                      <option value="">{t("admin.nabu.builtin")}</option>
                      {v.agents.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                      {v.scenarios[sc] && !v.agents.some((a) => a.name === v.scenarios[sc]) && (
                        <option value={v.scenarios[sc]}>{v.scenarios[sc]}</option>
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {v.url && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="sec">{t("admin.nabu.transfer")}</h2>
          <p className="small muted">{t(v.migrated ? "admin.nabu.transferDone" : "admin.nabu.transferHint")}</p>
          <button className="btn primary sm" disabled={!v.connected || migrate.isPending} onClick={() => setConfirm(true)}>
            <Icon name="upload" />{t(v.migrated ? "admin.nabu.transferAgain" : "admin.nabu.transferButton")}
          </button>
          {report && (
            <div className="small" style={{ marginTop: 10 }}>
              <b>{t("admin.nabu.report")}</b>
              <ul>
                {Object.entries(report.serviceAgents ?? {}).map(([sc, a]) => (
                  <li key={sc}>{t(`llm.scenario.${sc}`, { defaultValue: sc })} → <span className="mono">{a}</span></li>
                ))}
              </ul>
              {(report.skipped?.length ?? 0) > 0 && (
                <div className="muted">{t("admin.nabu.skipped", { count: report.skipped!.length })}: {report.skipped!.map((x) => JSON.stringify(x)).join("; ")}</div>
              )}
            </div>
          )}
        </div>
      )}

      {confirm && (
        <Modal title={t("admin.nabu.transfer")} onClose={() => setConfirm(false)} footer={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
          <button className="btn primary" disabled={migrate.isPending} onClick={() => migrate.mutate()}>{t("admin.nabu.transferButton")}</button>
        </>}>
          <p>{t("admin.nabu.transferConfirm")}</p>
          {migrate.error && <div className="err-text">{errorText(t, migrate.error)}</div>}
        </Modal>
      )}
    </>
  );
}
