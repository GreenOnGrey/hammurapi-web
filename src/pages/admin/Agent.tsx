import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, qs } from "../../api/client";
import { keys } from "../../api/queries";
import { AGENT_SCENARIOS, SCENARIO_STAGE } from "../../api/types";
import type {
  AgentModelDef, AgentScenario, AgentSkill, LLMCheckResult, LLMConnection, MCPCheckResult, MCPServerInfo,
  ModelChoice, ResolvedModel, ScenarioModels, SkillChange, UsageReport,
} from "../../api/types";
import { errorText } from "../../lib/errors";
import { llmErrorText } from "../../lib/llm";
import { duration } from "../../lib/format";
import { Icon, Loading, Modal, Switch, useToast } from "@green-on-grey/ui-kit";

const BASE = "/admin/api/v1/agent";

/** Models of the DeepSeek preset; the server owns their limits and prices. */
const DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];
const DEEPSEEK_URL = "https://api.deepseek.com";

/** Status dot of a connection or an MCP server (design §1). */
function StatusDot({ status, enabled = true }: { status: string; enabled?: boolean }) {
  const { t } = useTranslation();
  const s = enabled ? status : "disabled";
  const color = s === "ok" ? "g" : s === "unknown" || s === "disabled" ? "n" : "r";
  return <span className="nowrap"><span className={`sdot ${color}`} />{t(`llm.status.${s}`, { defaultValue: s })}</span>;
}

function ScenarioChips({ list }: { list: AgentScenario[] }) {
  const { t } = useTranslation();
  if (list.length === 0) return <span className="small muted">{t("admin.agent.allScenarios")}</span>;
  return <span className="chips">{list.map((s) => <span key={s} className="chip">{t(`llm.scenario.${s}`)}</span>)}</span>;
}

function ScenarioPicker({ value, onChange }: { value: AgentScenario[]; onChange: (v: AgentScenario[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="chips" role="group">
      {AGENT_SCENARIOS.map((s) => (
        <button key={s} type="button" className={`chip${value.includes(s) ? " on" : ""}`} aria-pressed={value.includes(s)}
          onClick={() => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])}>{t(`llm.scenario.${s}`)}</button>
      ))}
    </div>
  );
}

// ─── LLM connections ─────────────────────────────────────────────────

interface ConnectionsList { items: LLMConnection[]; scenarios: Record<string, AgentScenario[]> }

export function AgentConnectionsAdmin() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: keys.agentConnections, queryFn: () => api.get<ConnectionsList>(`${BASE}/connections`) });
  const [adding, setAdding] = useState(false);
  const [keyOf, setKeyOf] = useState<LLMConnection | null>(null);
  const [checked, setChecked] = useState<{ c: LLMConnection; results: LLMCheckResult[] } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.agentConnections });
    qc.invalidateQueries({ queryKey: keys.agentResolved });
  };
  const check = useMutation({
    mutationFn: (c: LLMConnection) => api.post<{ results: LLMCheckResult[] }>(`${BASE}/connections/${c.id}/check`).then((r) => ({ c, results: r.results })),
    onSuccess: (r) => { setChecked(r); refresh(); },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const toggle = useMutation({
    mutationFn: (c: LLMConnection) => api.patch(`${BASE}/connections/${c.id}`, { enabled: !c.enabled }),
    onSuccess: refresh,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const del = useMutation({
    mutationFn: (c: LLMConnection) => api.del(`${BASE}/connections/${c.id}`),
    onSuccess: refresh,
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const items = list.data?.items ?? [];
  const problems = items.filter((c) => c.enabled && (c.status === "insufficient_balance" || c.status === "auth"));
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.agent.connections.title")}</h1>
      <p className="small t2">{t("admin.agent.connections.hint")}</p>
      {list.isLoading && <Loading />}
      {list.error && <div className="err-text">{errorText(t, list.error)}</div>}
      <table className="t">
        <thead><tr>
          <th>{t("admin.agent.connections.name")}</th><th>{t("admin.deploy.type")}</th><th>{t("admin.agent.connections.models")}</th>
          <th>{t("admin.agent.connections.key")}</th><th>{t("admin.agent.status")}</th><th />
        </tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td>DeepSeek</td>
              <td className="mono small">{c.models.map((m) => m.id).join(", ")}</td>
              <td className="mono small">••••{c.keyLast4}</td>
              <td>
                <StatusDot status={c.status} enabled={c.enabled} />
                {c.statusAt && <div className="small muted">{duration(c.statusAt, i18n.language)}</div>}
              </td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn ghost sm" disabled={check.isPending} onClick={() => check.mutate(c)}>{t("admin.agent.check")}</button>
                <button className="btn ghost sm" onClick={() => setKeyOf(c)}>{t("admin.agent.connections.replaceKey")}</button>
                <Switch on={c.enabled} label={t("admin.agent.enabled")} onChange={() => toggle.mutate(c)} />
                <button className="btn ghost sm danger" aria-label={t("common.delete")} onClick={() => { if (window.confirm(t("admin.agent.connections.confirmDelete", { name: c.name }))) del.mutate(c); }}>
                  <Icon name="trash" size={14} />
                </button>
              </td>
            </tr>
          ))}
          {list.data && items.length === 0 && <tr><td colSpan={6} className="small muted">{t("admin.agent.connections.empty")}</td></tr>}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setAdding(true)}><Icon name="plus" size={15} />{t("admin.agent.connections.add")}</button>
      {problems.map((c) => (
        <div key={c.id} className="llmerr" role="alert" style={{ marginTop: 16 }}>
          <b>{llmErrorText(t, c.status, c.name)}</b>
          <div className="small">{t(`admin.agent.connections.fix.${c.status}`)}</div>
          {(list.data?.scenarios[c.id] ?? []).length > 0 && (
            <div className="small">{t("admin.agent.connections.stopped")} <ScenarioChips list={list.data?.scenarios[c.id] ?? []} /></div>
          )}
        </div>
      ))}
      {adding && <NewConnectionModal onClose={() => setAdding(false)} onSaved={refresh} />}
      {keyOf && <ReplaceKeyModal c={keyOf} onClose={() => setKeyOf(null)} onSaved={refresh} />}
      {checked && (
        <Modal title={t("admin.agent.checkOf", { name: checked.c.name })} onClose={() => setChecked(null)}
          footer={<button className="btn" onClick={() => setChecked(null)}>{t("common.close")}</button>}>
          <CheckResults results={checked.results} />
        </Modal>
      )}
    </>
  );
}

function CheckResults({ results }: { results: LLMCheckResult[] }) {
  const { t } = useTranslation();
  return (
    <table className="t">
      <tbody>
        {results.map((r) => (
          <tr key={r.model}>
            <td className="mono small">{r.model}</td>
            <td>{r.ok
              ? <span className="okc">{t("admin.agent.connections.answered", { ms: r.latencyMs ?? 0 })}</span>
              : <span className="err">{r.httpStatus ? `${r.httpStatus} · ` : ""}{llmErrorText(t, r.errorClass ?? "bad_request")}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NewConnectionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("DeepSeek");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(DEEPSEEK_MODELS);
  const body = () => ({ type: "deepseek", name, apiKey, models });
  const check = useMutation({ mutationFn: () => api.post<{ results: LLMCheckResult[] }>(`${BASE}/connections/check`, body()) });
  // Saving is allowed after a failed check too (design §3.2).
  const save = useMutation({
    mutationFn: () => api.post(`${BASE}/connections`, body()),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const ready = !!name.trim() && !!apiKey.trim() && models.length > 0;
  return (
    <Modal title={t("admin.agent.connections.add")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={!ready || check.isPending} onClick={() => check.mutate()}>{t("admin.agent.check")}</button>
        <button className="btn primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      <div className="field"><label>{t("admin.deploy.type")}</label>
        <div className="seg"><button aria-pressed>DeepSeek</button></div>
        <div className="hint">{t("admin.agent.connections.moreTypes")}</div>
      </div>
      <div className="two">
        <div className="field"><label htmlFor="lc-name">{t("admin.agent.connections.name")}</label>
          <input id="lc-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="lc-key">{t("admin.agent.connections.key")}</label>
          <input id="lc-key" className="inp mono" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" /></div>
      </div>
      <div className="field"><label htmlFor="lc-url">{t("admin.agent.connections.baseUrl")}</label>
        <input id="lc-url" className="inp mono" value={DEEPSEEK_URL} readOnly /></div>
      <div className="field"><label>{t("admin.agent.connections.models")}</label>
        <div className="chips">
          {DEEPSEEK_MODELS.map((m) => (
            <button key={m} type="button" className={`chip mono${models.includes(m) ? " on" : ""}`} aria-pressed={models.includes(m)}
              onClick={() => setModels(models.includes(m) ? models.filter((x) => x !== m) : [...models, m])}>{m}</button>
          ))}
        </div>
      </div>
      {check.data && <CheckResults results={check.data.results} />}
      {check.error && <div className="err-text">{errorText(t, check.error)}</div>}
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

function ReplaceKeyModal({ c, onClose, onSaved }: { c: LLMConnection; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const save = useMutation({
    mutationFn: () => api.put(`${BASE}/connections/${c.id}/key`, { apiKey }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  return (
    <Modal title={t("admin.agent.connections.replaceKeyOf", { name: c.name })} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!apiKey.trim() || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      <div className="field"><label htmlFor="rk-key">{t("admin.agent.connections.newKey")}</label>
        <input id="rk-key" className="inp mono" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
      <div className="hint">{t("admin.agent.connections.keyHint")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

// ─── models by scenario ──────────────────────────────────────────────

/** Levels offered for a model: "off" and those mapped to a provider value. */
export function thinkingLevels(m: AgentModelDef | undefined): string[] {
  const out = ["off"];
  if (!m?.reasoning) return out;
  for (const l of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
    const v = m.thinkingLevelMap?.[l];
    if (v !== undefined && v !== null) out.push(l);
  }
  return out;
}

const STAGES = ["all", "discovery", "development", "delivery"] as const;

export function AgentModelsAdmin() {
  const conns = useQuery({ queryKey: keys.agentConnections, queryFn: () => api.get<ConnectionsList>(`${BASE}/connections`) });
  const models = useQuery({ queryKey: keys.agentModels, queryFn: () => api.get<ScenarioModels>(`${BASE}/scenario-models`) });
  const resolved = useQuery({ queryKey: keys.agentResolved, queryFn: () => api.get<ResolvedModel[]>(`${BASE}/scenario-models/resolved`) });
  if (conns.isLoading || models.isLoading || !models.data) return <Loading />;
  return <ModelsEditor key={JSON.stringify(models.data)} saved={models.data} connections={conns.data?.items ?? []} resolved={resolved.data ?? []} />;
}

function ModelsEditor({ saved, connections, resolved }: { saved: ScenarioModels; connections: LLMConnection[]; resolved: ResolvedModel[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<ScenarioModels>(saved);
  const save = useMutation({
    mutationFn: (v: ScenarioModels) => api.put<ScenarioModels>(`${BASE}/scenario-models`, v as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.agentModels });
      qc.invalidateQueries({ queryKey: keys.agentResolved });
      toast({ kind: "ok", title: t("admin.agent.models.saved") });
    },
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const enabled = connections.filter((c) => c.enabled);
  const byId = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections]);
  const resolvedOf = (s: AgentScenario) => resolved.find((r) => r.scenario === s);
  const setScenario = (s: AgentScenario, v: ModelChoice | null) => setDraft({ ...draft, scenarios: { ...draft.scenarios, [s]: v } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const def = draft.default;
  const defLabel = def ? `${byId.get(def.connectionId)?.name ?? "?"} · ${def.model}${def.thinking && def.thinking !== "off" ? ` · ${def.thinking}` : ""}` : t("admin.agent.models.notSet");
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.agent.models.title")}</h1>
      <p className="small t2">{t("admin.agent.models.hint")}</p>
      {enabled.length === 0 && <div className="banner warn"><Icon name="alert" /><span className="grow">{t("admin.agent.models.noConnections")}</span></div>}
      <div className="card defcard">
        <div className="lbl">{t("admin.agent.models.default")}</div>
        <ChoiceEditor value={def} connections={enabled} byId={byId}
          onChange={(v) => setDraft({ ...draft, default: v })} />
      </div>
      <table className="t">
        <thead><tr><th>{t("admin.agent.models.scenario")}</th><th>{t("admin.agent.models.model")}</th></tr></thead>
        <tbody>
          {STAGES.map((stage) => [
            <tr key={stage} className="stagerow"><td colSpan={2}>{stage === "all" ? t("admin.agent.models.allStages") : t(`stages.${stage === "discovery" ? "research" : stage}`)}</td></tr>,
            ...AGENT_SCENARIOS.filter((s) => SCENARIO_STAGE[s] === stage).map((s) => {
              const r = resolvedOf(s);
              const bad = r && r.status !== "ok" && r.status !== "unknown";
              return (
                <tr key={s} className={bad ? "bad" : undefined}>
                  <td>{t(`llm.scenario.${s}`)}
                    {bad && r && <div className="small err">{llmErrorText(t, r.status, r.connectionName)}</div>}
                  </td>
                  <td>
                    <ChoiceEditor value={draft.scenarios[s]} connections={enabled} byId={byId} inheritLabel={t("admin.agent.models.inherit", { model: defLabel })}
                      onChange={(v) => setScenario(s, v)} />
                  </td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button className="btn primary" disabled={!dirty || !draft.default || save.isPending} onClick={() => save.mutate(draft)}>{t("common.save")}</button>
        {dirty && <button className="btn ghost" onClick={() => setDraft(saved)}>{t("common.cancel")}</button>}
      </div>
    </>
  );
}

/** Connection, model and level; with inheritLabel the empty value means "the default". */
function ChoiceEditor({ value, connections, byId, inheritLabel, onChange }: {
  value: ModelChoice | null; connections: LLMConnection[]; byId: Map<string, LLMConnection>;
  inheritLabel?: string; onChange: (v: ModelChoice | null) => void;
}) {
  const { t } = useTranslation();
  const conn = value ? byId.get(value.connectionId) : undefined;
  const model = conn?.models.find((m) => m.id === value?.model);
  // A disabled connection stays in the list while it is selected.
  const options = conn && !connections.includes(conn) ? [...connections, conn] : connections;
  const pick = (key: string) => {
    if (!key) return onChange(null);
    const [cid, mid] = key.split("|");
    const m = byId.get(cid)?.models.find((x) => x.id === mid);
    const level = value?.thinking && thinkingLevels(m).includes(value.thinking) ? value.thinking : "off";
    onChange({ connectionId: cid, model: mid, thinking: level });
  };
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <select className={`inp${value ? "" : " inherit"}`} style={{ width: "auto", minWidth: 260 }} aria-label={t("admin.agent.models.model")}
        value={value ? `${value.connectionId}|${value.model}` : ""} onChange={(e) => pick(e.target.value)}>
        {inheritLabel !== undefined ? <option value="">{inheritLabel}</option> : !value && <option value="">{t("admin.agent.models.choose")}</option>}
        {options.map((c) => c.models.map((m) => (
          <option key={`${c.id}|${m.id}`} value={`${c.id}|${m.id}`}>{c.name} · {m.name ?? m.id}</option>
        )))}
      </select>
      {value && (
        <select className="inp" style={{ width: "auto" }} aria-label={t("admin.agent.models.thinking")} value={value.thinking || "off"}
          onChange={(e) => onChange({ ...value, thinking: e.target.value })}>
          {thinkingLevels(model).map((l) => <option key={l} value={l}>{l === "off" ? t("admin.agent.models.thinkingOff") : l}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── skills ──────────────────────────────────────────────────────────

export function AgentSkillsAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const skills = useQuery({ queryKey: keys.agentSkills, queryFn: () => api.get<AgentSkill[]>(`${BASE}/skills`) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AgentSkill | null>(null);
  const done = (title: string) => () => { qc.invalidateQueries({ queryKey: keys.agentSkills }); toast({ kind: "ok", title }); };
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const approve = useMutation({ mutationFn: (c: SkillChange) => api.post(`${BASE}/skills/changes/${c.id}/approve`), onSuccess: done(t("admin.agent.skills.approved")), onError: fail });
  const withdraw = useMutation({ mutationFn: (c: SkillChange) => api.post(`${BASE}/skills/changes/${c.id}/withdraw`), onSuccess: done(t("admin.agent.skills.withdrawn")), onError: fail });
  const del = useMutation({ mutationFn: (s: AgentSkill) => api.del(`${BASE}/skills/${s.name}`), onSuccess: done(t("admin.agent.skills.proposed")), onError: fail });
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.agent.skills.title")}</h1>
      <p className="small t2">{t("admin.agent.skills.hint")}</p>
      {skills.isLoading && <Loading />}
      {skills.error && <div className="err-text">{errorText(t, skills.error)}</div>}
      <table className="t">
        <thead><tr><th>{t("admin.agent.skills.skill")}</th><th>{t("admin.agent.scenarios")}</th><th>{t("admin.agent.status")}</th><th /></tr></thead>
        <tbody>
          {skills.data?.map((s) => (
            <tr key={s.name}>
              <td><b className="mono">{s.name}</b><div className="small t2">{s.description}</div></td>
              <td><ScenarioChips list={s.scenarios} /></td>
              <td>
                {s.status === "active" && <span><span className="sdot g" />{t("admin.agent.skills.status.active")}</span>}
                {s.status !== "active" && (
                  <>
                    <span><span className={`sdot ${s.status === "pending_delete" ? "r" : "a"}`} />{t(`admin.agent.skills.status.${s.status}`)}</span>
                    {s.change && (
                      <div className="small t2">
                        <a href={s.change.prUrl} target="_blank" rel="noreferrer">PR #{s.change.prNumber}</a> · {s.change.author}
                      </div>
                    )}
                  </>
                )}
              </td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                {s.change && s.change.state === "open" && (
                  <>
                    <button className="btn ghost sm" disabled={approve.isPending} onClick={() => approve.mutate(s.change as SkillChange)}>{t("admin.agent.skills.approve")}</button>
                    <button className="btn ghost sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate(s.change as SkillChange)}>{t("admin.agent.skills.withdraw")}</button>
                  </>
                )}
                {s.status === "active" && (
                  <>
                    <button className="btn ghost sm" onClick={() => setEditing(s)}>{t("admin.agent.scenarios")}</button>
                    <button className="btn ghost sm danger" aria-label={t("common.delete")} onClick={() => { if (window.confirm(t("admin.agent.skills.confirmDelete", { name: s.name }))) del.mutate(s); }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {skills.data && skills.data.length === 0 && <tr><td colSpan={4} className="small muted">{t("admin.agent.skills.empty")}</td></tr>}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setAdding(true)}><Icon name="plus" size={15} />{t("admin.agent.skills.add")}</button>
      {adding && <NewSkillModal onClose={() => setAdding(false)} onSaved={done(t("admin.agent.skills.proposed"))} />}
      {editing && <SkillScenariosModal s={editing} onClose={() => setEditing(null)} onSaved={done(t("admin.agent.skills.proposed"))} />}
    </>
  );
}

function NewSkillModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"zip" | "text">("zip");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("---\nname: my-skill\ndescription: \n---\n\n");
  const [scenarios, setScenarios] = useState<AgentScenario[]>([]);
  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (mode === "zip" && file) form.append("archive", file);
      else form.append("skillMd", text);
      form.append("scenarios", scenarios.join(","));
      return api.upload<{ changeId: string; prUrl: string }>(`${BASE}/skills`, form);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });
  const ready = mode === "zip" ? !!file : text.trim().length > 0;
  const details = save.error && "details" in save.error ? ((save.error as { details?: { details?: string[] } }).details?.details ?? []) : [];
  return (
    <Modal title={t("admin.agent.skills.add")} wide onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{t("admin.agent.skills.propose")}</button>
      </>
    }>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button aria-pressed={mode === "zip"} onClick={() => setMode("zip")}>{t("admin.agent.skills.zip")}</button>
        <button aria-pressed={mode === "text"} onClick={() => setMode("text")}>{t("admin.agent.skills.text")}</button>
      </div>
      {mode === "zip" ? (
        <label className="drop">
          <div className="ic"><Icon name="upload" /></div>
          {file ? <b>{file.name}</b> : t("admin.agent.skills.dropZip")}
          <input type="file" accept=".zip,application/zip" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      ) : (
        <textarea className="inp mono" rows={12} value={text} aria-label="SKILL.md" onChange={(e) => setText(e.target.value)} />
      )}
      <div className="field" style={{ marginTop: 12 }}><label>{t("admin.agent.scenarios")}</label>
        <ScenarioPicker value={scenarios} onChange={setScenarios} />
        <div className="hint">{t("admin.agent.skills.scenariosHint")}</div>
      </div>
      <div className="hint">{t("admin.agent.skills.prHint")}</div>
      {save.error && (
        <div className="llmerr" role="alert">
          <b>{errorText(t, save.error)}</b>
          {details.map((d) => <div key={d} className="small">{d}</div>)}
        </div>
      )}
    </Modal>
  );
}

function SkillScenariosModal({ s, onClose, onSaved }: { s: AgentSkill; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [scenarios, setScenarios] = useState<AgentScenario[]>(s.scenarios);
  const save = useMutation({
    mutationFn: () => api.put(`${BASE}/skills/${s.name}/scenarios`, { scenarios }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  return (
    <Modal title={s.name} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>{t("admin.agent.skills.propose")}</button>
      </>
    }>
      <ScenarioPicker value={scenarios} onChange={setScenarios} />
      <div className="hint">{t("admin.agent.skills.scenariosHint")}</div>
      <div className="hint">{t("admin.agent.skills.prHint")}</div>
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

// ─── MCP servers ─────────────────────────────────────────────────────

export function AgentMCPAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: keys.agentMCP, queryFn: () => api.get<MCPServerInfo[]>(`${BASE}/mcp-servers`) });
  const [edit, setEdit] = useState<MCPServerInfo | "new" | null>(null);
  const [checked, setChecked] = useState<{ name: string; res: MCPCheckResult } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.agentMCP });
  const fail = (e: unknown) => toast({ kind: "error", title: errorText(t, e) });
  const check = useMutation({
    mutationFn: (s: MCPServerInfo) => api.post<MCPCheckResult>(`${BASE}/mcp-servers/${s.id}/check`).then((res) => ({ name: s.name, res })),
    onSuccess: (r) => { setChecked(r); refresh(); },
    onError: fail,
  });
  const toggle = useMutation({ mutationFn: (s: MCPServerInfo) => api.patch(`${BASE}/mcp-servers/${s.id}`, { enabled: !s.enabled }), onSuccess: refresh, onError: fail });
  const del = useMutation({ mutationFn: (s: MCPServerInfo) => api.del(`${BASE}/mcp-servers/${s.id}`), onSuccess: refresh, onError: fail });
  return (
    <>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("admin.agent.mcp.title")}</h1>
      <p className="small t2">{t("admin.agent.mcp.hint")}</p>
      {list.isLoading && <Loading />}
      {list.error && <div className="err-text">{errorText(t, list.error)}</div>}
      <table className="t">
        <thead><tr><th>{t("admin.agent.mcp.server")}</th><th>{t("admin.agent.mcp.exposure")}</th><th>{t("admin.agent.scenarios")}</th><th>{t("admin.agent.status")}</th><th /></tr></thead>
        <tbody>
          {list.data?.map((s) => (
            <tr key={s.id ?? s.name}>
              <td>
                <b className="mono">{s.builtin && <Icon name="lock" size={13} />} {s.name}</b>
                <div className="small t2 mono ellipsis" style={{ maxWidth: 320 }}>{s.url}</div>
              </td>
              <td className="small">{t(`admin.agent.mcp.${s.exposure}`)}</td>
              <td>{s.builtin ? <span className="small muted">{t("admin.agent.allScenarios")}</span> : <ScenarioChips list={s.scenarios} />}</td>
              <td>
                <StatusDot status={s.status} enabled={s.enabled} />
                {s.status === "ok" && s.toolsCount !== null && <div className="small muted">{t("admin.agent.mcp.tools", { count: s.toolsCount })}</div>}
                {s.status === "error" && s.statusReason && <div className="small err ellipsis" style={{ maxWidth: 240 }} title={s.statusReason}>{s.statusReason}</div>}
              </td>
              <td className="row" style={{ justifyContent: "flex-end" }}>
                {!s.builtin && (
                  <>
                    <button className="btn ghost sm" disabled={check.isPending} onClick={() => check.mutate(s)}>{t("admin.agent.check")}</button>
                    <button className="btn ghost sm" onClick={() => setEdit(s)}>{t("admin.services.edit")}</button>
                    <Switch on={s.enabled} label={t("admin.agent.enabled")} onChange={() => toggle.mutate(s)} />
                    <button className="btn ghost sm danger" aria-label={t("common.delete")} onClick={() => { if (window.confirm(t("admin.agent.mcp.confirmDelete", { name: s.name }))) del.mutate(s); }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setEdit("new")}><Icon name="plus" size={15} />{t("admin.agent.mcp.add")}</button>
      {edit && <MCPModal s={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={refresh} />}
      {checked && (
        <Modal title={t("admin.agent.checkOf", { name: checked.name })} onClose={() => setChecked(null)}
          footer={<button className="btn" onClick={() => setChecked(null)}>{t("common.close")}</button>}>
          <MCPCheck res={checked.res} />
        </Modal>
      )}
    </>
  );
}

function MCPCheck({ res }: { res: MCPCheckResult }) {
  const { t } = useTranslation();
  if (!res.ok) return <div className="llmerr" role="alert">{res.error}</div>;
  return (
    <table className="t">
      <tbody>
        {res.tools.map((tl) => (
          <tr key={tl.name}>
            <td className="mono small">{tl.name}<div className="t2" style={{ fontFamily: "var(--font)" }}>{tl.description}</div></td>
            <td className="small nowrap">{tl.readOnly
              ? <span className="okc">{t("admin.agent.mcp.readOnly")}</span>
              : <span className={tl.destructive ? "err" : "warn"}>{t("admin.agent.mcp.mutates")}</span>}</td>
          </tr>
        ))}
        {res.tools.length === 0 && <tr><td className="small muted">{t("admin.agent.mcp.noTools")}</td></tr>}
      </tbody>
    </table>
  );
}

function MCPModal({ s, onClose, onSaved }: { s: MCPServerInfo | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(s?.name ?? "");
  const [url, setUrl] = useState(s?.url ?? "https://");
  // Stored values are never shown: an empty value keeps the stored one.
  const [headers, setHeaders] = useState<{ name: string; value: string; last4?: string }[]>(
    s?.headers.map((h) => ({ name: h.name, value: "", last4: h.last4 })) ?? [],
  );
  const [exposure, setExposure] = useState<"direct" | "deferred">(s?.exposure ?? "deferred");
  const [scenarios, setScenarios] = useState<AgentScenario[]>(s?.scenarios ?? []);
  const body = () => ({ name, url, exposure, scenarios, headers: headers.filter((h) => h.name.trim()).map((h) => ({ name: h.name.trim(), value: h.value })) });
  const check = useMutation({ mutationFn: () => api.post<MCPCheckResult>(`${BASE}/mcp-servers/check`, body()) });
  const save = useMutation({
    mutationFn: () => (s ? api.patch(`${BASE}/mcp-servers/${s.id}`, body()) : api.post(`${BASE}/mcp-servers`, body())),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const ready = !!name.trim() && /^https?:\/\/.+/.test(url);
  return (
    <Modal title={s ? s.name : t("admin.agent.mcp.add")} wide onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn" disabled={!ready || check.isPending} onClick={() => check.mutate()}>{t("admin.agent.check")}</button>
        <button className="btn primary" disabled={!ready || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
      </>
    }>
      <div className="two">
        <div className="field"><label htmlFor="mcp-name">{t("admin.agent.connections.name")}</label>
          <input id="mcp-name" className="inp mono" value={name} disabled={!!s} onChange={(e) => setName(e.target.value.toLowerCase())} /></div>
        <div className="field"><label htmlFor="mcp-url">URL</label>
          <input id="mcp-url" className="inp mono" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      </div>
      <div className="field"><label>{t("admin.agent.mcp.headers")}</label>
        {headers.map((h, i) => (
          <div key={i} className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input className="inp mono" style={{ flex: 1 }} placeholder="Authorization" aria-label={t("admin.agent.mcp.headerName")} value={h.name}
              onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="inp mono" style={{ flex: 2 }} type="password" autoComplete="off" aria-label={t("admin.agent.mcp.headerValue")}
              placeholder={h.last4 ? `••••${h.last4}` : "Bearer …"} value={h.value}
              onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button className="btn ghost sm" aria-label={t("common.delete")} onClick={() => setHeaders(headers.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={() => setHeaders([...headers, { name: "", value: "" }])}><Icon name="plus" size={14} />{t("admin.agent.mcp.addHeader")}</button>
      </div>
      <div className="field"><label>{t("admin.agent.mcp.exposure")}</label>
        <div className="seg">
          {(["direct", "deferred"] as const).map((x) => <button key={x} aria-pressed={exposure === x} onClick={() => setExposure(x)}>{t(`admin.agent.mcp.${x}`)}</button>)}
        </div>
        <div className="hint">{t("admin.agent.mcp.exposureHint")}</div>
      </div>
      <div className="field"><label>{t("admin.agent.scenarios")}</label>
        <ScenarioPicker value={scenarios} onChange={setScenarios} />
        <div className="hint">{t("admin.agent.mcp.scenariosHint")}</div>
      </div>
      {check.data && <MCPCheck res={check.data} />}
      {check.error && <div className="err-text">{errorText(t, check.error)}</div>}
      {save.error && <div className="err-text">{errorText(t, save.error)}</div>}
    </Modal>
  );
}

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

interface AuditEntry {
  id: string; objectType: string; objectRef: string; action: string; summary: string;
  actor: string | null; prUrl: string | null; selfApproved: boolean; createdAt: string;
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
  const audit = useQuery({ queryKey: ["admin", "agent", "audit"], queryFn: () => api.get<{ items: AuditEntry[] }>(`${BASE}/audit${qs({ limit: 20 })}`) });
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
          <th>{t("admin.agent.usage.connection")}</th><th>{t("admin.agent.models.model")}</th>
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
      <h2 style={{ fontSize: 16, marginTop: 28 }}>{t("admin.agent.audit.title")}</h2>
      <table className="t">
        <tbody>
          {audit.data?.items.map((a) => (
            <tr key={a.id}>
              <td className="small muted nowrap">{duration(a.createdAt, i18n.language)}</td>
              <td className="small">{a.actor ?? t("admin.agent.audit.system")}</td>
              <td>{a.summary}{a.prUrl && <> · <a href={a.prUrl} target="_blank" rel="noreferrer">PR</a></>}
                {a.selfApproved && <span className="req">{t("admin.agent.audit.selfApproved")}</span>}</td>
            </tr>
          ))}
          {audit.data && audit.data.items.length === 0 && <tr><td className="small muted">{t("admin.agent.audit.empty")}</td></tr>}
        </tbody>
      </table>
    </>
  );
}
