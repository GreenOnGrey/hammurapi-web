import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { invalidateCycle, keys, useDomains, useServices } from "../../api/queries";
import type { DeploySettings, ServiceDTO } from "../../api/types";
import { useSession } from "../../app/session";
import { errorText } from "../../lib/errors";
import { Icon, Loading, Modal, useToast } from "@green-on-grey/ui-kit";
import { AgentFields, useAgentSettings } from "../feature/Autonomy";
import { ServiceCiSection } from "./CiCheck";

/** Services: the catalog from Backstage or the manual list (R10, R11). */
export function ServicesAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useSession();
  const services = useServices();
  const [edit, setEdit] = useState<ServiceDTO | "new" | null>(null);
  const [override, setOverride] = useState<ServiceDTO | null>(null);
  const del = useMutation({
    mutationFn: (key: string) => api.del(`/admin/api/v1/services/${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.services }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const managed = !!services.data?.some((s) => s.source === "backstage");
  // FTR.HMR.CMN-0002 design §3: an override of a service changes the deploy of an environment; without one
  // configured there is nothing to override
  const deployEnvs = useConfiguredDeployEnvs(me.globalAdmin);
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.services.title")}</h1>
      {services.isLoading && <Loading />}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className="t">
          <thead><tr><th>{t("admin.services.key")}</th><th>{t("admin.services.system")}</th><th>{t("admin.services.repo")}</th><th>{t("admin.services.owners")}</th><th>{t("codegen.autonomy")}</th><th /></tr></thead>
          <tbody>
            {services.data?.map((s) => (
              <tr key={s.key}>
                <td><b>{s.key}</b>{s.source === "backstage" && <div className="small muted">{t("admin.domains.fromBackstage")}</div>}
                  {s.deletedInCatalog && <div className="small err-text" style={{ margin: 0 }}>{t("admin.domains.deletedInCatalog")}</div>}</td>
                <td>{s.system ?? "—"}</td>
                <td className="mono small">{s.repo}</td>
                <td className="small">{s.owners.join(", ") || <span className="muted">{s.ownerRef || "—"}</span>}</td>
                <td>
                  {t(`autonomy.${s.autonomy}.name`)}
                  {!s.check && <div className="small muted">{t("admin.services.noCheck")}</div>}
                </td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    {me.globalAdmin && (deployEnvs.length > 0 || hasOverride(s)) && <button className="btn ghost sm" onClick={() => setOverride(s)} title={t("admin.deploy.override")}><Icon name="rocket" size={14} /></button>}
                    <button className="btn ghost sm" onClick={() => setEdit(s)}>{t("admin.services.edit")}</button>
                    {s.source === "manual" && <button className="btn ghost sm danger" disabled={del.isPending} onClick={() => del.mutate(s.key)}><Icon name="trash" size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!managed && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setEdit("new")}><Icon name="plus" size={15} />{t("admin.services.add")}</button>}
      {managed && <p className="small muted">{t("admin.services.managed")}</p>}
      {edit && <ServiceModal s={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {override && <OverrideModal s={override} envs={deployEnvs} onClose={() => setOverride(null)} />}
    </>
  );
}

/** The settings of a service: its data, when it is not from the catalog, and its agent. */
function ServiceModal({ s, onClose }: { s: ServiceDTO | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { owns } = useSession();
  const agent = useAgentSettings(s);
  const domains = useDomains();
  const [key, setKey] = useState(s?.key ?? "");
  const [name, setName] = useState(s?.name ?? "");
  const [system, setSystem] = useState(s?.system ?? "");
  const [repo, setRepo] = useState(s?.repo ?? "");
  const [owner, setOwner] = useState(s?.ownerRef ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const body = { key, name, system: system || null, repo, ownerRef: owner };
      if (!s) await api.post("/admin/api/v1/services", body);
      else if (name !== s.name || system !== (s.system ?? "") || repo !== s.repo || owner !== (s.ownerRef ?? "")) await api.patch(`/admin/api/v1/services/${s.key}`, body);
      await agent.persist();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.services }); qc.invalidateQueries({ queryKey: keys.ciCheck }); invalidateCycle(qc); onClose(); },
  });
  const editable = !s || s.source === "manual";
  const systems = domains.data?.flatMap((d) => d.systems.map((x) => `${d.key}/${x.key}`)) ?? [];
  return (
    <Modal title={s ? t("admin.services.settings", { key: s.key }) : t("admin.services.add")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!key || !repo || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      {editable && <>
        <div className="two">
          <div className="field"><label htmlFor="sv-key">{t("admin.services.key")}</label>
            <input id="sv-key" className="inp mono" value={key} disabled={!!s} onChange={(e) => setKey(e.target.value.toLowerCase())} /></div>
          <div className="field"><label htmlFor="sv-name">{t("admin.domains.name")}</label>
            <input id="sv-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="sv-system">{t("admin.services.system")}</label>
          <select id="sv-system" className="inp" value={system} onChange={(e) => setSystem(e.target.value)}>
            <option value="">—</option>
            {systems.map((x) => <option key={x} value={x}>{x}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sv-repo">{t("admin.services.repo")}</label>
          <input id="sv-repo" className="inp mono" value={repo} placeholder="team/booking" onChange={(e) => setRepo(e.target.value)} /></div>
        <div className="field"><label htmlFor="sv-owner">{t("admin.services.ownerRef")}</label>
          <input id="sv-owner" className="inp mono" value={owner} placeholder="user:anna | group:team-fleet" onChange={(e) => setOwner(e.target.value)} />
          <div className="hint">{t("admin.services.ownerHint")}</div></div>
      </>}
      {s && <>
        {editable && <h3 className="group-h">{t("admin.services.agent")}</h3>}
        <AgentFields settings={agent} canSetAutonomy={owns(s.key)} />
        <ServiceCiSection service={s.key} repo={s.repo} />
      </>}
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

type DeployEnv = "production" | "stage";

const hasOverride = (s: ServiceDTO) => !!(s.deployOverride?.production || s.deployOverride?.stage);

/** The environments whose deploy is configured: only they can be overridden for a service. */
function useConfiguredDeployEnvs(enabled: boolean): DeployEnv[] {
  const read = (env: DeployEnv) => ({
    queryKey: keys.deploy(env), enabled,
    queryFn: () => api.get<DeploySettings>(`/admin/api/v1/deploy/${env}`),
  });
  const production = useQuery(read("production"));
  const stage = useQuery(read("stage"));
  const out: DeployEnv[] = [];
  if (production.data?.configured) out.push("production");
  if (stage.data?.configured) out.push("stage");
  return out;
}

function OverrideModal({ s, envs, onClose }: { s: ServiceDTO; envs: DeployEnv[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // the configured environments, and one with an override already: it can still be seen and cleared
  const tabs = (["production", "stage"] as const).filter((e) => envs.includes(e) || !!s.deployOverride?.[e]);
  const first = tabs[0] ?? "production";
  const [env, setEnv] = useState<DeployEnv>(first);
  const [workflow, setWorkflow] = useState(s.deployOverride?.[first]?.workflow ?? "");
  const [ref, setRef] = useState(s.deployOverride?.[first]?.ref ?? "");
  const pick = (e: "production" | "stage") => {
    setEnv(e);
    setWorkflow(s.deployOverride?.[e]?.workflow ?? "");
    setRef(s.deployOverride?.[e]?.ref ?? "");
  };
  const save = useMutation({
    mutationFn: () => api.put(`/admin/api/v1/services/${s.key}/deploy-override`, { env, workflow, ref }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.services }); onClose(); },
  });
  return (
    <Modal title={t("admin.deploy.overrideOf", { key: s.key })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={s.overrideFromCatalog || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      {s.overrideFromCatalog && <div className="banner info">{t("admin.deploy.fromAnnotation")}</div>}
      <div className="seg" style={{ marginBottom: 12 }}>
        {tabs.map((e) => <button key={e} aria-pressed={env === e} onClick={() => pick(e)}>{t(`admin.deploy.env.${e}`)}</button>)}
      </div>
      <div className="two">
        <div className="field"><label htmlFor="ov-wf">{t("admin.deploy.workflow")}</label>
          <input id="ov-wf" className="inp mono" value={workflow} disabled={s.overrideFromCatalog} onChange={(e) => setWorkflow(e.target.value)} /></div>
        <div className="field"><label htmlFor="ov-ref">Ref</label>
          <input id="ov-ref" className="inp mono" value={ref} disabled={s.overrideFromCatalog} onChange={(e) => setRef(e.target.value)} /></div>
      </div>
      <div className="hint">{t("admin.deploy.overrideHint")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}
