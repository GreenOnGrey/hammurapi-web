import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { ImportFeaturePreview, ImportJob, Issue } from "../api/types";
import { useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { bytes } from "../lib/format";
import { useEvent } from "../lib/sse";
import { Icon } from "../components/Icon";
import { Loading, Modal } from "../components/ui";

export function ImportUploadModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { config } = useSession();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return api.upload<ImportJob>("/api/v1/imports", form);
    },
    onSuccess: (job) => {
      onClose();
      navigate(`/imports/${job.id}`);
    },
  });
  const tooBig = file && file.size > config.importMaxBytes;
  return (
    <Modal title={t("import.title")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={!file || !!tooBig || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? t("import.checking") : t("import.check")}
        </button>
      </>
    }>
      <div className={`drop${over ? " over" : ""}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
        <div className="ic"><Icon name="upload" /></div>
        {file ? (
          <b style={{ color: "var(--text)" }}>{file.name} · {bytes(file.size, i18n.language)}</b>
        ) : (
          <>
            <b style={{ color: "var(--text)" }}>{t("import.drop")}</b>
            <div className="small" style={{ marginTop: 4 }}>{t("import.choose", { max: bytes(config.importMaxBytes, i18n.language) })}</div>
          </>
        )}
        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        {t("import.structure")} <span className="mono">specs/&lt;domain&gt;/&lt;system&gt;/&lt;ID&gt;/&lt;area&gt;/spec.md</span>, <span className="mono">rules/</span> — {t("import.rulesOptional")}
      </div>
      {tooBig && <div className="err-text">{t("errors.archive_too_large", { maxBytes: config.importMaxBytes })}</div>}
      {upload.error && <div className="err-text">{errorText(t, upload.error)}</div>}
    </Modal>
  );
}

function issueText(t: ReturnType<typeof useTranslation>["t"], i: Issue): string {
  return t(`import.issues.${i.code}`, { ...i.params, defaultValue: i.code });
}

export function ImportPage() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const job = useQuery({
    queryKey: keys.importJob(id),
    queryFn: () => api.get<ImportJob>(`/api/v1/imports/${id}`),
    // Polling is a fallback in case an SSE event is missed.
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });
  useEvent("import.progress", (d: { importId: string; status: string; done?: number; total?: number; current?: string }) => {
    if (d.importId !== id) return;
    if (d.total !== undefined) setProgress({ done: d.done ?? 0, total: d.total, current: d.current });
    if (d.status !== "running" || d.done === d.total) qc.invalidateQueries({ queryKey: keys.importJob(id) });
  });
  const action = useMutation({
    mutationFn: (kind: "confirm" | "revalidate" | "cancel") =>
      kind === "cancel" ? api.del(`/api/v1/imports/${id}`) : api.post<ImportJob>(`/api/v1/imports/${id}/${kind}`),
    onSuccess: (data, kind) => {
      if (kind === "cancel") navigate("/");
      else qc.setQueryData(keys.importJob(id), data);
    },
  });
  const [creatingFor, setCreatingFor] = useState<ImportFeaturePreview | null>(null);

  if (job.isLoading) return <main className="main"><Loading /></main>;
  if (!job.data) return <main className="main"><div className="banner warn">{errorText(t, job.error)}</div></main>;
  const j = job.data;
  const ready = j.features.filter((f) => f.errors.length === 0);
  const failed = j.features.length - ready.length;
  const proposals = j.rules.filter((r) => r.action === "propose");

  if (j.status === "running" || j.status === "done" || j.status === "failed") {
    const results = j.results.filter((r) => r.status !== "skipped");
    const done = progress?.done ?? results.filter((r) => r.status === "imported" || r.status === "failed").length;
    const total = progress?.total ?? results.length;
    return (
      <main className="main narrow">
        <div className="crumbs">{t("import.crumbs", { name: j.fileName, size: bytes(j.size, i18n.language) })}</div>
        {j.status === "running" ? (
          <div className="card">
            <h2 className="sec">{t("import.running")}</h2>
            <div className="bar" style={{ margin: "6px 0 10px" }}><i style={{ width: `${total ? (100 * done) / total : 0}%` }} /></div>
            <div className="small t2">{t("import.progress", { done, total })}{progress?.current && <> · <span className="mono">{progress.current.split("/").pop()}</span></>}</div>
          </div>
        ) : (
          <div className="card">
            <h2 className="sec">{j.status === "done" ? t("import.finished") : t("import.failed")}</h2>
            <div className="hist">
              {j.results.map((r) => (
                <div className="h" key={r.archiveId}>
                  <span style={{ color: r.status === "imported" ? "var(--green)" : r.status === "failed" ? "var(--red)" : "var(--muted)" }}>
                    {r.status === "imported" ? <Icon name="check" /> : r.status === "failed" ? <Icon name="x" /> : "–"}
                  </span>
                  <div>
                    {r.newId ? <Link className="fid" to={`/features/${r.newId}`}>{r.newId}</Link> : <span className="mono">{r.archiveId.split("/").pop()}</span>}{" "}
                    {r.status === "imported" && t("import.gatesCreated", { count: r.gates })}
                    {r.status === "skipped" && <span className="muted">{t("import.skipped")}</span>}
                    {r.status === "failed" && <span className="err">{r.error}</span>}
                  </div>
                  {r.prUrl ? <a className="sha" href={r.prUrl} target="_blank" rel="noreferrer">PR/MR</a> : <span />}
                </div>
              ))}
            </div>
            {j.rules.some((r) => r.result) && (
              <>
                <h3 className="sec" style={{ marginTop: 16 }}>{t("import.rulesTitle")}</h3>
                {j.rules.filter((r) => r.result).map((r) => (
                  <div key={`${r.area}/${r.file}`} className="small t2">
                    {t(`areas.${r.area}`, { defaultValue: r.area })} · {r.file}: {r.result === "proposed" ? t("import.ruleProposed") : t(`errors.${r.result}`, { defaultValue: r.result })}
                    {r.prUrl && <> · <a href={r.prUrl} target="_blank" rel="noreferrer">PR/MR</a></>}
                  </div>
                ))}
              </>
            )}
            <div className="row" style={{ marginTop: 16 }}><Link className="btn sm" to="/">{t("common.home")}</Link></div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="main">
      <div className="crumbs">{t("import.crumbs", { name: j.fileName, size: bytes(j.size, i18n.language) })}</div>
      <h1 className="ftitle" style={{ fontSize: 20 }}>{t("import.previewTitle")}</h1>
      <div className="meta" style={{ marginBottom: 14 }}>
        {t("import.summary", { ready: ready.length, failed })}
      </div>
      <div className="imp head"><span /><span>{t("import.colFeature")}</span><span>{t("import.colAreas")}</span><span>{t("import.colCheck")}</span></div>
      {j.features.map((f) => {
        const ok = f.errors.length === 0;
        const needsDictionary = f.errors.some((e) => e.code === "unknown_domain" || e.code === "unknown_system");
        return (
          <div key={`${f.domain}/${f.system}/${f.archiveId}`} className="imp" style={ok ? undefined : { opacity: 0.85 }}>
            <span className={`cb${ok ? " on" : ""}`} aria-label={ok ? t("import.ready") : t("import.blocked")}>{ok && <Icon name="check" size={12} />}</span>
            <div>
              <span className="fid">{f.archiveId}</span>
              {f.newId && <><span className="arrow">→</span><span className="fid">{f.newId}</span></>}
              {f.parent && <span className="tag-fix" style={{ marginLeft: 6 }}>fix</span>}
              <div style={{ marginTop: 4, fontWeight: 500 }}>{f.title}</div>
            </div>
            <div className="small t2">
              {f.areas.map((a) => t(`areas.${a}`, { defaultValue: a })).join(", ")}
              <div className="muted">
                {t("import.files", { count: f.files })}
                {f.parent && <> · {t("import.parent")} <span className="fid">{f.parent}</span></>}
              </div>
            </div>
            <div className="small">
              {ok && f.warnings.length === 0 && <span className="okc">{t("import.ready")}</span>}
              {f.errors.map((e, i) => <div key={i} className="err">{issueText(t, e)}</div>)}
              {f.warnings.map((w, i) => <div key={i} className="warn">{issueText(t, w)}</div>)}
              {needsDictionary && <DictionaryHelp f={f} admins={j.admins} onCreate={() => setCreatingFor(f)} />}
            </div>
          </div>
        );
      })}
      {j.rules.length > 0 && (
        <>
          <h3 className="sec" style={{ marginTop: 18 }}>{t("import.rulesTitle")}</h3>
          {j.rules.map((r) => (
            <div key={`${r.area}/${r.file}`} className="small t2">
              {t(`areas.${r.area}`, { defaultValue: r.area })} · <span className="mono">{r.file}</span>:{" "}
              {r.action === "propose" ? t("import.ruleWillPropose") : t(`import.ruleSkip.${r.reason}`, { defaultValue: r.reason })}
            </div>
          ))}
        </>
      )}
      {action.error && <div className="err-text">{errorText(t, action.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn ghost" disabled={action.isPending} onClick={() => action.mutate("cancel")}>{t("import.cancel")}</button>
        <button className="btn" disabled={action.isPending} onClick={() => action.mutate("revalidate")}>{t("import.revalidate")}</button>
        <button className="btn primary" disabled={action.isPending || (ready.length === 0 && proposals.length === 0)} onClick={() => action.mutate("confirm")}>
          {t("import.confirm", { count: ready.length })}
        </button>
      </div>
      {creatingFor && (
        <CreateDictionaryModal f={creatingFor} onClose={() => setCreatingFor(null)}
          onDone={() => { setCreatingFor(null); action.mutate("revalidate"); }} />
      )}
    </main>
  );
}

function DictionaryHelp({ f, admins, onCreate }: { f: ImportFeaturePreview; admins: string[]; onCreate: () => void }) {
  const { t } = useTranslation();
  const { isAnyAdmin } = useSession();
  if (isAnyAdmin) {
    return <div style={{ marginTop: 6 }}><button className="btn sm" onClick={onCreate}>{t("import.createDictionary")}</button></div>;
  }
  return <div className="muted" style={{ marginTop: 6 }}>{t("import.askAdmin", { names: admins.join(", ") || "—", domain: f.domain, system: f.system })}</div>;
}

function CreateDictionaryModal({ f, onClose, onDone }: { f: ImportFeaturePreview; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const missingDomain = f.errors.some((e) => e.code === "unknown_domain");
  const [domainName, setDomainName] = useState(f.domain);
  const [systemName, setSystemName] = useState(f.system);
  const create = useMutation({
    mutationFn: async () => {
      if (missingDomain) await api.post("/admin/api/v1/domains", { key: f.domain, name: domainName, approvalRequired: true });
      await api.post(`/admin/api/v1/domains/${f.domain}/systems`, { key: f.system, name: systemName });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.domains });
      onDone();
    },
  });
  return (
    <Modal title={t("import.createDictionary")} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn primary" disabled={create.isPending} onClick={() => create.mutate()}>{t("common.create")}</button>
      </>
    }>
      {missingDomain && (
        <div className="field">
          <label htmlFor="cd-d">{t("admin.domains.domainName", { key: f.domain })}</label>
          <input id="cd-d" className="inp" value={domainName} onChange={(e) => setDomainName(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="cd-s">{t("admin.domains.systemName", { key: f.system })}</label>
        <input id="cd-s" className="inp" value={systemName} onChange={(e) => setSystemName(e.target.value)} />
      </div>
      {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
    </Modal>
  );
}
