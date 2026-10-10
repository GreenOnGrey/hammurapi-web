import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys, useServices } from "../../api/queries";
import type { DeployConfig, DeploySettings, DeployType } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon } from "../../components/Icon";
import { Loading, useToast } from "../../components/ui";

const DEFAULT_PARAMS = `service={service}
ref={ref}
environment={environment}
run_id={run_id}
callback_url={callback_url}`;

/** Deploy settings per environment (R40, design spec §3.18). */
export function DeployAdmin() {
  const { t } = useTranslation();
  const [env, setEnv] = useState<"production" | "stage">("production");
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.deploy.title")}</h1>
      <div className="tabs" role="tablist">
        {(["stage", "production"] as const).map((e) => (
          <button key={e} role="tab" aria-selected={env === e} className={env === e ? "on" : ""} onClick={() => setEnv(e)}>{t(`admin.deploy.env.${e}`)}</button>
        ))}
      </div>
      <EnvForm key={env} env={env} />
    </>
  );
}

function EnvForm({ env }: { env: "production" | "stage" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const services = useServices();
  const cur = useQuery({ queryKey: keys.deploy(env), queryFn: () => api.get<DeploySettings>(`/admin/api/v1/deploy/${env}`) });
  const [form, setForm] = useState<DeployConfig>({ type: "github-actions", workflow: "deploy.yml", ref: "", url: "", auth: "bot", params: null, timeoutMinutes: 60 });
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [secret, setSecret] = useState<string | null>(null);
  const [testService, setTestService] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  // The form takes the settings whenever they are loaded (another
  // environment, a save): during render, without an effect.
  const [formOf, setFormOf] = useState<DeploySettings | undefined>(undefined);
  if (cur.data && cur.data !== formOf) {
    setFormOf(cur.data);
    const s = cur.data.settings;
    if (s) {
      setForm(s);
      setParams(Object.entries(s.params ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"));
    }
  }
  const parsed = () => Object.fromEntries(params.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  const save = useMutation({
    mutationFn: () => api.put<DeploySettings>(`/admin/api/v1/deploy/${env}`, { ...form, params: parsed() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: keys.deploy(env) });
      if (r.secret) setSecret(r.secret);
      toast({ kind: "ok", title: t("admin.settings.saved") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<{ secret: string }>(`/admin/api/v1/deploy/${env}/secret/rotate`),
    onSuccess: (r) => { setSecret(r.secret); qc.invalidateQueries({ queryKey: keys.deploy(env) }); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; runUrl?: string; error?: string }>(`/admin/api/v1/deploy/${env}/test`, { service: testService || services.data?.[0]?.key }),
    onSuccess: (r) => setTestResult(r.ok ? t("admin.deploy.testOk", { url: r.runUrl ?? "" }) : t("admin.deploy.testFailed", { error: r.error ?? "" })),
    onError: (e) => setTestResult(errorText(t, e)),
  });
  if (cur.isLoading) return <Loading />;
  const set = (p: Partial<DeployConfig>) => setForm({ ...form, ...p });
  const hook = `${window.location.origin}/hooks/v1/deploy`;
  return (
    <div className="card" style={{ maxWidth: 760, marginTop: 12 }}>
      {!cur.data?.configured && <div className="banner info">{t(`admin.deploy.notConfigured.${env}`)}</div>}
      <div className="field"><label>{t("admin.deploy.type")}</label>
        <div className="seg">
          {(["github-actions", "gitlab-ci", "webhook"] as DeployType[]).map((x) => (
            <button key={x} aria-pressed={form.type === x} onClick={() => set({ type: x })}>{t(`admin.deploy.types.${x}`)}</button>
          ))}
        </div>
      </div>
      {form.type !== "webhook" ? (
        <div className="two">
          <div className="field"><label htmlFor="dp-wf">{t("admin.deploy.workflow")}</label>
            <input id="dp-wf" className="inp mono" value={form.workflow ?? ""} disabled={form.type === "gitlab-ci"} onChange={(e) => set({ workflow: e.target.value })} /></div>
          <div className="field"><label htmlFor="dp-ref">Ref</label>
            <input id="dp-ref" className="inp mono" value={form.ref ?? ""} placeholder="{ref}" onChange={(e) => set({ ref: e.target.value })} /></div>
        </div>
      ) : (
        <div className="field"><label htmlFor="dp-url">URL</label>
          <input id="dp-url" className="inp mono" value={form.url ?? ""} placeholder="https://deploy.example.com/hooks/hammurapi" onChange={(e) => set({ url: e.target.value })} /></div>
      )}
      <div className="two">
        <div className="field"><label>{t("admin.deploy.auth")}</label>
          <div className="seg">
            {(["bot", "secret"] as const).map((x) => <button key={x} aria-pressed={form.auth === x} onClick={() => set({ auth: x })}>{t(`admin.deploy.authTypes.${x}`)}</button>)}
          </div></div>
        <div className="field"><label htmlFor="dp-to">{t("admin.deploy.timeout")}</label>
          <input id="dp-to" className="inp" type="number" min={1} value={form.timeoutMinutes} onChange={(e) => set({ timeoutMinutes: Number(e.target.value) })} /></div>
      </div>
      <div className="field"><label htmlFor="dp-params">{t("admin.deploy.params")}</label>
        <textarea id="dp-params" className="inp mono" rows={6} value={params} onChange={(e) => setParams(e.target.value)} />
        <div className="hint">{t("admin.deploy.paramsHint")}</div></div>
      <button className="btn primary sm" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>

      <h3 className="group-h">{t("admin.deploy.resultHook")}</h3>
      <div className="row">
        <code className="mono small grow">{hook}</code>
        <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(hook)}><Icon name="copy" size={14} />{t("admin.deploy.copy")}</button>
      </div>
      <div className="webhook">{`{ "runId": "{run_id}", "service": "booking", "environment": "${env}",
  "ref": "v3.2.0", "status": "started" | "success" | "failure", "runUrl": "…" }`}</div>
      {cur.data?.configured && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small t2">{t("admin.cycle.activeSecrets", { n: cur.data.activeSecrets ?? 0 })}</span>
          <button className="btn sm" disabled={rotate.isPending} onClick={() => rotate.mutate()}><Icon name="refresh" size={14} />{t("admin.cycle.rotate")}</button>
        </div>
      )}
      {secret && <div className="banner warn" style={{ marginTop: 8 }}><span className="grow">{t("admin.cycle.secretOnce")} <code>{secret}</code></span></div>}

      {cur.data?.configured && (
        <>
          <h3 className="group-h">{t("admin.deploy.test")}</h3>
          <div className="row">
            <select className="inp" style={{ maxWidth: 220 }} value={testService} onChange={(e) => setTestService(e.target.value)}>
              {services.data?.map((s) => <option key={s.key} value={s.key}>{s.key}</option>)}
            </select>
            <button className="btn sm" disabled={test.isPending} onClick={() => test.mutate()}>{t("admin.deploy.testRun")}</button>
          </div>
          {testResult && <p className="small">{testResult}</p>}
        </>
      )}
    </div>
  );
}
