// FTR.HMR.DEV-0004 R8–R11, design §3.4–§3.5: the side panel with the log of a run of an agent — live while the run
// goes, kept at the bottom unless the reader scrolls up, opened from a task or from a run in the popover of the cost.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, Markdown } from "@green-on-grey/ui-kit";
import { apiUrl } from "../../api/base";
import type { RunLogEntry } from "../../api/types";
import { appendDelta, atBottom, filterLog, mergeEntry, money, toolLine, type LogFilter } from "../../lib/cost";

export type LogRun = { runId: string; label?: string };
type Open = (o: { runId: string; runs?: LogRun[]; title?: string }) => void;

const Ctx = createContext<Open>(() => {});

/** Opens the log of a run (R8, R11). */
export const useRunLog = () => useContext(Ctx);

/** The page of a feature: the log open in the address (?log=<run>) for a link to send (design §2.3). */
export function RunLogProvider({ featureId, children }: { featureId: string; children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const runId = params.get("log");
  const [meta, setMeta] = useState<{ runs?: LogRun[]; title?: string }>({});
  const open = useCallback<Open>((o) => {
    setMeta({ runs: o.runs, title: o.title });
    setParams((p) => { p.set("log", o.runId); return p; });
  }, [setParams]);
  const close = () => setParams((p) => { p.delete("log"); return p; });
  return (
    <Ctx.Provider value={open}>
      {children}
      {runId && <RunLogPanel key={runId} featureId={featureId} runId={runId} runs={meta.runs} title={meta.title} onClose={close}
        onSwitch={(id) => setParams((p) => { p.set("log", id); return p; })} />}
    </Ctx.Provider>
  );
}

type State = "loading" | "live" | "done" | "expired" | "error";

function RunLogPanel({ featureId, runId, runs, title, onClose, onSwitch }: {
  featureId: string; runId: string; runs?: LogRun[]; title?: string; onClose: () => void; onSwitch: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<RunLogEntry[]>([]);
  const [state, setState] = useState<State>("loading");
  const [reconnecting, setReconnecting] = useState(false);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [unseen, setUnseen] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const es = new EventSource(apiUrl(`/api/v1/features/${featureId}/runs/${runId}/log`), { withCredentials: true });
    let ended = false;
    const take = (e: RunLogEntry) => {
      if (e.kind === "done") ended = true;
      setEntries((l) => mergeEntry(l, e));
      setReconnecting(false);
      setState((s) => (e.kind === "expired" ? "expired" : e.kind === "done" ? "done" : s === "loading" ? "live" : s));
      if (!follow.current) setUnseen((n) => n + 1);
    };
    es.addEventListener("entry", (ev) => take(JSON.parse((ev as MessageEvent).data)));
    es.addEventListener("delta", (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as { id: string; text: string };
      setEntries((l) => appendDelta(l, d.id, d.text));
    });
    es.addEventListener("reconnect", () => setReconnecting(true));
    es.onerror = (ev) => {
      if ((ev as MessageEvent).data) { // the api could not reach Nabu
        setState("error");
        es.close();
        return;
      }
      // the server closed the stream: after the end of the run there is nothing more to read
      if (ended || es.readyState === EventSource.CLOSED) {
        es.close();
        setState((s) => (s === "live" || s === "loading" ? "done" : s));
      } else {
        setReconnecting(true);
      }
    };
    return () => es.close();
  }, [featureId, runId]);

  useEffect(() => {
    const el = body.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const shown = useMemo(() => filterLog(entries, filter), [entries, filter]);
  const toLatest = () => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
    follow.current = true;
    setUnseen(0);
  };
  return (
    <aside className="runlog" aria-label={t("log.title", { subject: title ?? t("log.run") })}>
      <div className="runlog-h">
        <div className="runlog-row">
          <b className="grow">{t("log.title", { subject: title ?? t("log.run") })}</b>
          {state === "live" && <><span className="ring" /><span className="small">{t("log.live")}</span></>}
          <button className="btn ghost sm" aria-label={t("common.close")} onClick={onClose}><Icon name="x" size={15} /></button>
        </div>
        <div className="runlog-row">
          {runs && runs.length > 1 && (
            <select value={runId} onChange={(e) => onSwitch(e.target.value)} aria-label={t("log.runs")}>
              {runs.map((r) => <option key={r.runId} value={r.runId}>{r.label ?? r.runId}</option>)}
            </select>
          )}
          <span className="grow" />
          <div className="seg" role="group" aria-label={t("log.filter.label")}>
            {(["all", "commands", "messages"] as const).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`log.filter.${f}`)}</button>
            ))}
          </div>
        </div>
      </div>
      {reconnecting && <div className="banner warn small">{t("log.reconnecting")}</div>}
      <div className="runlog-b" ref={body} onScroll={(e) => { follow.current = atBottom(e.currentTarget); if (follow.current) setUnseen(0); }}>
        {state === "loading" && entries.length === 0 && <div className="small muted runlog-empty">{t("common.loading")}</div>}
        {state === "error" && <div className="err-text runlog-empty">{t("log.error")}</div>}
        {state === "live" && entries.length === 0 && <div className="small muted runlog-empty">{t("log.empty")}</div>}
        {shown.map((e) => <LogEntry key={e.id} e={e} />)}
        {unseen > 0 && (
          <div className="runlog-latest"><button className="btn primary sm" onClick={toLatest}>{t("log.toLatest", { count: unseen })}</button></div>
        )}
      </div>
    </aside>
  );
}

const ICONS: Record<string, string> = { message: "msg", tool: "code", check: "check", step: "branch", done: "flag", stalled: "alert", error: "alert" };

function LogEntry({ e }: { e: RunLogEntry }) {
  const { t, i18n } = useTranslation();
  const time = e.at ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(e.at)) : "";
  const bad = e.isError || e.status === "failed" || e.kind === "error";
  let content: ReactNode;
  switch (e.kind) {
    case "expired":
      return <div className="small muted runlog-empty">{t("log.expired", { days: (e.data?.days as number) ?? 30 })}</div>;
    case "message":
      content = <div className="runlog-msg"><Markdown text={e.text ?? ""} /></div>;
      break;
    case "tool":
      content = (
        <details open={bad}>
          <summary className="mono runlog-cmd">{toolLine(e)}</summary>
          {e.result != null && <pre className="mono small">{e.result}</pre>}
        </details>
      );
      break;
    case "check": {
      const d = e.data ?? {};
      content = <span>{t(`log.check.${e.status === "finished" ? "finished" : "started"}`, { command: String(d.command ?? ""), status: String(d.status ?? ""),
        attempt: Number(d.attempt ?? 0), max: Number(d.maxAttempts ?? 0) })}</span>;
      break;
    }
    case "stalled":
      content = <span className="runlog-warn">{t("log.stalled", { reason: String(e.data?.reason ?? "") })}</span>;
      break;
    case "error":
      content = <span className="err-text">{String(e.data?.message ?? e.data?.errorClass ?? "")}</span>;
      break;
    case "step":
      content = <span className={bad ? "err-text" : ""}>{t(`log.step.${e.step}`, { defaultValue: e.step })}{e.detail ? ": " + e.detail : ""}{e.retry ? " · " + t("log.step.retry") : ""}</span>;
      break;
    case "done": {
      const d = e.data ?? {};
      const usage = (d.usage ?? {}) as { costUsd?: number; costKnown?: boolean };
      content = <b>{t("log.done", { status: String(d.status ?? ""), amount: usage.costKnown === false ? t("cost.unknownPrice") : money(usage.costUsd ?? 0, i18n.language) })}</b>;
      break;
    }
  }
  return (
    <div className={`runlog-e${bad ? " bad" : ""}`}>
      <span className="runlog-ic">{bad ? "✗" : <Icon name={(ICONS[e.kind] ?? "dots") as "msg"} size={14} />}</span>
      <div className="runlog-c">{content}</div>
      <span className="runlog-t small muted">{time}</span>
    </div>
  );
}
