import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type { CatalogError, CatalogSettings, CycleSettings } from "../../api/types";
import { errorText } from "../../lib/errors";
import { dateTime } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { Loading, Switch, useToast } from "../../components/ui";

/** Cycle settings (design spec §3.18): Backstage catalog, feature flags, stage. */
export function CycleAdmin() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.cycle.title")}</h1>
      <CatalogCard />
      <FlagsStageCard />
    </>
  );
}

function CatalogCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cat = useQuery({ queryKey: keys.catalog, queryFn: () => api.get<CatalogSettings>("/admin/api/v1/catalog") });
  const errors = useQuery({ queryKey: ["admin", "catalogErrors"], queryFn: () => api.get<CatalogError[]>("/admin/api/v1/catalog/errors") });
  // The form takes the settings whenever they are loaded again (after a
  // save or a sync): during render, without an effect.
  const [form, setForm] = useState<CatalogSettings | null>(null);
  const [formOf, setFormOf] = useState<CatalogSettings | undefined>(undefined);
  if (cat.data && cat.data !== formOf) {
    setFormOf(cat.data);
    setForm(cat.data);
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.catalog });
    qc.invalidateQueries({ queryKey: ["admin", "catalogErrors"] });
    qc.invalidateQueries({ queryKey: keys.domains });
    qc.invalidateQueries({ queryKey: keys.adminDomains });
    qc.invalidateQueries({ queryKey: keys.services });
  };
  const save = useMutation({
    mutationFn: () => api.put("/admin/api/v1/catalog", { ...form! }),
    onSuccess: () => { refresh(); toast({ kind: "ok", title: t("admin.settings.saved") }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ domains: number; systems: number; services: number; errors: number }>("/admin/api/v1/catalog/sync"),
    onSuccess: (r) => { refresh(); toast({ kind: "ok", title: t("admin.cycle.synced", r) }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (cat.isLoading || !form) return <Loading />;
  const set = (patch: Partial<CatalogSettings>) => setForm({ ...form, ...patch });
  return (
    <div className="card" style={{ maxWidth: 720, marginTop: 12 }}>
      <h2 className="sec">{t("admin.cycle.catalog")}</h2>
      <Switch on={form.enabled} onChange={(v) => set({ enabled: v })} label={t("admin.cycle.catalogEnabled")} />
      <p className="small t2">{t("admin.cycle.catalogHint")}</p>
      <div className="two">
        <div className="field"><label htmlFor="cat-repo">{t("admin.cycle.catalogRepo")}</label>
          <input id="cat-repo" className="inp mono" value={form.catalogRepo} placeholder="platform/catalog" onChange={(e) => set({ catalogRepo: e.target.value })} /></div>
        <div className="field"><label htmlFor="cat-glob">{t("admin.cycle.catalogGlob")}</label>
          <input id="cat-glob" className="inp mono" value={form.catalogGlob} onChange={(e) => set({ catalogGlob: e.target.value })} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="cat-svc">{t("admin.cycle.serviceFile")}</label>
          <input id="cat-svc" className="inp mono" value={form.serviceFilePath} onChange={(e) => set({ serviceFilePath: e.target.value })} /></div>
        <div className="field"><label htmlFor="cat-repos">{t("admin.cycle.serviceRepos")}</label>
          <textarea id="cat-repos" className="inp mono" rows={3} value={form.serviceRepos.join("\n")}
            onChange={(e) => set({ serviceRepos: e.target.value.split(/\s+/).filter(Boolean) })} /></div>
      </div>
      <div className="row">
        <button className="btn primary sm" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
        <button className="btn sm" disabled={!cat.data?.enabled || sync.isPending} onClick={() => sync.mutate()}><Icon name="refresh" size={14} />{t("admin.cycle.syncNow")}</button>
        <span className="small muted">
          {cat.data?.lastSyncAt ? t("admin.cycle.lastSync", { at: dateTime(cat.data.lastSyncAt, i18n.language) }) : t("admin.cycle.neverSynced")}
        </span>
      </div>
      {cat.data?.lastSyncError && <div className="err-text">{cat.data.lastSyncError}</div>}
      {!!errors.data?.length && (
        <>
          <h3 className="group-h">{t("admin.cycle.notImported")}</h3>
          <table className="t">
            <tbody>
              {errors.data.map((e) => (
                <tr key={`${e.kind}-${e.name}`}><td>{e.kind}</td><td className="mono">{e.name}</td><td className="small t2">{e.reason}</td><td className="small mono muted">{e.catalogRef}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function FlagsStageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const s = useQuery({ queryKey: keys.settings, queryFn: () => api.get<CycleSettings>("/admin/api/v1/settings") });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<CycleSettings>("/admin/api/v1/settings", body),
    onSuccess: (r) => qc.setQueryData(keys.settings, r),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<{ secret: string }>("/admin/api/v1/settings/feature-flags/secret/rotate"),
    onSuccess: (r) => { setSecret(r.secret); qc.invalidateQueries({ queryKey: keys.settings }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  if (!s.data) return <Loading />;
  return (
    <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
      <h2 className="sec">{t("admin.cycle.flags")}</h2>
      <Switch on={s.data.featureFlags.enabled} onChange={(v) => patch.mutate({ featureFlags: { enabled: v } })} label={t("admin.cycle.flagsEnabled")} />
      <p className="small t2">{t("admin.cycle.flagsHint")}</p>
      <div className="webhook">{`POST ${window.location.origin}/hooks/v1/feature-flags
X-Hammurapi-Signature: sha256=<hex HMAC of the body>
X-Hammurapi-Timestamp: <unix seconds>

{ "flag": "onboarding-v2", "state": "on", "environment": "production",
  "changedAt": "2026-09-14T10:00:00Z", "actor": "anna.k" }`}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="small t2">{t("admin.cycle.activeSecrets", { n: s.data.featureFlags.activeSecrets })}</span>
        <button className="btn sm" disabled={rotate.isPending} onClick={() => rotate.mutate()}><Icon name="refresh" size={14} />{t("admin.cycle.rotate")}</button>
      </div>
      {secret && <div className="banner warn" style={{ marginTop: 8 }}><span className="grow">{t("admin.cycle.secretOnce")} <code>{secret}</code></span></div>}
      <h2 className="sec" style={{ marginTop: 18 }}>{t("admin.cycle.stage")}</h2>
      <Switch on={s.data.stage.enabled} onChange={(v) => patch.mutate({ stage: { enabled: v } })} label={t("admin.cycle.stageEnabled")} />
      <p className="small t2">{t("admin.cycle.stageHint")}</p>
      <h2 className="sec" style={{ marginTop: 18 }}>{t("admin.cycle.runner")}</h2>
      <p className="small">{t("admin.cycle.executor", { executor: s.data.runnerExecutor })}</p>
      {s.data.runnerExecutor === "local" && <div className="banner warn">{t("admin.cycle.localWarning")}</div>}
    </div>
  );
}
