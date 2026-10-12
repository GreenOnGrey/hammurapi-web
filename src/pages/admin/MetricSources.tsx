import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { keys } from "../../api/queries";
import type { MetricSource } from "../../api/types";
import { errorText } from "../../lib/errors";
import { Icon, Loading, Modal, useToast } from "@green-on-grey/ui-kit";

/** Read-only metric sources for Discovery (arch §14). */
export function MetricSourcesAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: keys.metricSources, queryFn: () => api.get<MetricSource[]>("/admin/api/v1/metric-sources") });
  const [edit, setEdit] = useState<MetricSource | "new" | null>(null);
  const [testing, setTesting] = useState<MetricSource | null>(null);
  const del = useMutation({
    mutationFn: (name: string) => api.del(`/admin/api/v1/metric-sources/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.metricSources }),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.metrics.title")}</h1>
      <p className="small t2">{t("admin.metrics.hint")}</p>
      {list.isLoading && <Loading />}
      <table className="t">
        <thead><tr><th>{t("admin.metrics.name")}</th><th>{t("admin.deploy.type")}</th><th>Endpoint</th><th /></tr></thead>
        <tbody>
          {list.data?.map((m) => (
            <tr key={m.name}>
              <td><b>{m.name}</b></td><td>{m.type}</td><td className="mono small">{m.endpoint}</td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => setTesting(m)}>{t("admin.metrics.test")}</button>
                <button className="btn ghost sm" onClick={() => setEdit(m)}>{t("admin.services.edit")}</button>
                <button className="btn ghost sm danger" onClick={() => del.mutate(m.name)}><Icon name="trash" size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setEdit("new")}><Icon name="plus" size={15} />{t("admin.metrics.add")}</button>
      {edit && <SourceModal m={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {testing && <TestModal m={testing} onClose={() => setTesting(null)} />}
    </>
  );
}

function SourceModal({ m, onClose }: { m: MetricSource | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(m?.name ?? "");
  const [type, setType] = useState<MetricSource["type"]>(m?.type ?? "clickhouse");
  const [endpoint, setEndpoint] = useState(m?.endpoint ?? "");
  const [username, setUsername] = useState(m?.username ?? "");
  const [password, setPassword] = useState("");
  const [secretRef, setSecretRef] = useState(m?.secretRef?.startsWith("env:") ? m.secretRef : "");
  const [maxSec, setMaxSec] = useState(m?.limits?.maxExecutionSeconds ?? 30);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, type, endpoint, username: username || null, password: password || undefined, secretRef: secretRef || undefined,
        limits: { maxExecutionSeconds: maxSec, maxResultRows: m?.limits?.maxResultRows ?? 10000, maxRangeDays: m?.limits?.maxRangeDays ?? 90 } };
      return m ? api.patch(`/admin/api/v1/metric-sources/${m.name}`, body) : api.post("/admin/api/v1/metric-sources", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.metricSources }); onClose(); },
  });
  return (
    <Modal title={m ? m.name : t("admin.metrics.add")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!name || !endpoint || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      <div className="two">
        <div className="field"><label htmlFor="ms-name">{t("admin.metrics.name")}</label>
          <input id="ms-name" className="inp mono" value={name} disabled={!!m} onChange={(e) => setName(e.target.value.toLowerCase())} /></div>
        <div className="field"><label>{t("admin.deploy.type")}</label>
          <div className="seg">
            {(["clickhouse", "prometheus"] as const).map((x) => <button key={x} aria-pressed={type === x} onClick={() => setType(x)}>{x === "clickhouse" ? "ClickHouse" : "Prometheus / VictoriaMetrics"}</button>)}
          </div></div>
      </div>
      <div className="field"><label htmlFor="ms-ep">Endpoint</label>
        <input id="ms-ep" className="inp mono" value={endpoint} placeholder={type === "clickhouse" ? "http://clickhouse:8123" : "http://prometheus:9090"} onChange={(e) => setEndpoint(e.target.value)} /></div>
      <div className="two">
        <div className="field"><label htmlFor="ms-user">{t("admin.metrics.username")}</label>
          <input id="ms-user" className="inp" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div className="field"><label htmlFor="ms-pass">{t("admin.metrics.password")}</label>
          <input id="ms-pass" className="inp" type="password" value={password} placeholder={m ? "••••••" : ""} onChange={(e) => setPassword(e.target.value)} /></div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="ms-ref">{t("admin.metrics.secretRef")}</label>
          <input id="ms-ref" className="inp mono" value={secretRef} placeholder="env:METRICS_PASSWORD" onChange={(e) => setSecretRef(e.target.value)} /></div>
        <div className="field"><label htmlFor="ms-max">{t("admin.metrics.maxSeconds")}</label>
          <input id="ms-max" className="inp" type="number" min={1} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value))} /></div>
      </div>
      <div className="hint">{t("admin.metrics.readOnly")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

function TestModal({ m, onClose }: { m: MetricSource; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; value?: number; error?: string }>(`/admin/api/v1/metric-sources/${m.name}/test`, { query }),
  });
  return (
    <Modal title={t("admin.metrics.testOf", { name: m.name })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.close")}</button>
        <button className="btn primary" disabled={!query.trim() || test.isPending} onClick={() => test.mutate()}>{t("admin.metrics.run")}</button>
      </>
    }>
      <textarea className="inp mono" rows={4} value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={m.type === "clickhouse" ? "SELECT count() FROM bookings WHERE ts > now() - INTERVAL 1 DAY" : "sum(rate(bookings_total[5m]))"} />
      {test.data?.ok && <div className="banner ok" style={{ marginTop: 8 }}>{t("admin.metrics.value", { value: test.data.value })}</div>}
      {test.data && !test.data.ok && <div className="banner warn" style={{ marginTop: 8 }}>{test.data.error}</div>}
      {test.error && <div className="err-text">{errorText(t, test.error)}</div>}
    </Modal>
  );
}
