import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { keys, useDocument } from "../api/queries";
import type { Area, FeatureCard, LockInfo } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { joinFrontMatter, normalizeEnding, splitFrontMatter } from "../lib/markdown";
import { useEvent } from "../lib/sse";
import { Icon } from "../components/Icon";
import { Loading, useToast } from "../components/ui";
import { MarkdownEditor, type EditorCommand, type EditorHandle } from "./MarkdownEditor";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_DELAY = 1500;
const HEARTBEAT = 5 * 60 * 1000;

export function DocumentPane({ feature, area }: { feature: FeatureCard; area: Area }) {
  const { t } = useTranslation();
  const { me, config } = useSession();
  const chat = useChatContext();
  const toast = useToast();
  const qc = useQueryClient();
  const doc = useDocument(feature.uniqueId, area);
  const editorRef = useRef<EditorHandle>(null);

  const [editorKey, setEditorKey] = useState(0);
  const [body, setBody] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [lockedBy, setLockedBy] = useState<LockInfo | null>(null);
  const front = useRef<string | null>(null);
  const baseSha = useRef("");
  const baseline = useRef<string | null>(null);
  const current = useRef<string>("");
  const timer = useRef<number | undefined>(undefined);
  const holdsLock = useRef(false);
  const heartbeat = useRef<number | undefined>(undefined);

  // Load (or reload) the document into the editor when a new version arrives
  // that is not our own save, and there are no unsaved local changes.
  useEffect(() => {
    const d = doc.data;
    if (!d) return;
    if (d.sha === baseSha.current && body !== null) return;
    if (state === "dirty" || state === "saving" || state === "error") return;
    const split = splitFrontMatter(d.content);
    front.current = split.front;
    baseSha.current = d.sha;
    baseline.current = null;
    // A new version of the document replaces the editor's content: the
    // state follows the server here, and only when a new version arrives —
    // not when the body or the save state change.
    // oxlint-disable-next-line react/set-state-in-effect
    setBody(split.body);
    setEditorKey((k) => k + 1);
    setLockedBy(d.lock && d.lock.userId !== me.id ? d.lock : null);
  }, [doc.data]); // oxlint-disable-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

  const lockedByOther = lockedBy !== null;
  const readOnly = !doc.data || doc.data.readOnly || lockedByOther;

  const acquireLock = useCallback(async () => {
    if (holdsLock.current || readOnly) return true;
    try {
      await api.post(`/api/v1/features/${feature.uniqueId}/lock`);
      holdsLock.current = true;
      window.clearInterval(heartbeat.current);
      heartbeat.current = window.setInterval(() => {
        api.post(`/api/v1/features/${feature.uniqueId}/lock`).catch(() => undefined);
      }, HEARTBEAT);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "feature_locked") {
        setLockedBy({ userId: "", userName: String(e.details.userName ?? ""), lockedAt: String(e.details.lockedAt ?? ""), expiresAt: "" });
      } else {
        toast({ kind: "error", title: errorText(t, e) });
      }
      return false;
    }
  }, [feature.uniqueId, readOnly, t, toast]);

  // Release the lock when leaving the document.
  useEffect(() => () => {
    window.clearInterval(heartbeat.current);
    window.clearTimeout(timer.current);
    if (holdsLock.current) {
      holdsLock.current = false;
      api.del(`/api/v1/features/${feature.uniqueId}/lock`).catch(() => undefined);
    }
  }, [feature.uniqueId]);

  const reload = useCallback(() => {
    window.clearTimeout(timer.current);
    baseSha.current = "";
    setState("idle");
    qc.invalidateQueries({ queryKey: keys.document(feature.uniqueId, area) });
  }, [qc, feature.uniqueId, area]);

  // save schedules itself again and offers a retry: through a ref, since a
  // callback cannot name itself while it is being created.
  const saveRef = useRef<() => void>(() => undefined);
  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    const md = current.current;
    if (baseline.current !== null && md === baseline.current) {
      setState("idle");
      return;
    }
    if (!(await acquireLock())) {
      setState("error");
      return;
    }
    setState("saving");
    try {
      const res = await api.put<{ sha: string; commit: string | null }>(
        `/api/v1/features/${feature.uniqueId}/gates/${area}/document`,
        { content: joinFrontMatter(front.current, normalizeEnding(md)), baseSha: baseSha.current },
      );
      baseSha.current = res.sha;
      baseline.current = md;
      // Newer keystrokes may have arrived while saving.
      if (current.current !== md) {
        setState("dirty");
        timer.current = window.setTimeout(() => saveRef.current(), SAVE_DELAY);
      } else {
        setState("saved");
      }
      qc.invalidateQueries({ queryKey: keys.feature(feature.uniqueId) });
    } catch (e) {
      setState("error");
      if (e instanceof ApiError && e.status === 423) {
        setLockedBy({ userId: "", userName: String(e.details.userName ?? ""), lockedAt: "", expiresAt: "" });
      }
      const stale = e instanceof ApiError && e.code === "stale_document";
      toast({
        kind: "error",
        title: stale ? t("editor.staleTitle") : t("editor.saveFailedTitle", { provider: config.provider === "github" ? "GitHub" : "GitLab" }),
        text: stale ? t("editor.staleText") : `${errorText(t, e)} ${t("editor.localOnly")}`,
        actions: [
          ...(stale ? [] : [{ label: t("editor.retry"), primary: true, onClick: () => saveRef.current() }]),
          { label: t("editor.discard"), primary: stale, onClick: reload },
        ],
      });
    }
  }, [acquireLock, area, feature.uniqueId, qc, reload, t, toast, config.provider]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onChange = useCallback((md: string) => {
    current.current = md;
    if (baseline.current === null || md === baseline.current) return;
    setState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(), SAVE_DELAY);
  }, [save]);

  // Someone else (or the agent) changed this gate: reload if we have no local edits.
  useEvent("gate.updated", (d: { uniqueId: string; area: string }) => {
    if (d.uniqueId === feature.uniqueId && d.area === area && state !== "dirty" && state !== "saving") {
      qc.invalidateQueries({ queryKey: keys.document(feature.uniqueId, area) });
    }
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (state !== "dirty" && state !== "saving" && state !== "error") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [state]);

  if (doc.isLoading || body === null) return doc.error ? <div className="banner warn">{errorText(t, doc.error)}</div> : <Loading />;

  const run = (cmd: EditorCommand) => editorRef.current?.run(cmd);
  const tool = (cmd: EditorCommand, label: React.ReactNode, title: string) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)} title={title} aria-label={title}>{label}</button>
  );

  return (
    <>
      {lockedByOther && (
        <div className="banner" role="status">
          <Icon name="lock" />
          <span><b>{t("editor.lockedBy", { name: lockedBy?.userName })}</b> {t("editor.lockedText", { name: lockedBy?.userName })}</span>
        </div>
      )}
      {doc.data?.generated && (
        <div className="banner" role="note">
          <span className="agentmark">{t("common.agent")}</span>
          <span className="grow">{t("editor.generated")}</span>
          <button className="btn sm" onClick={() => chat.send(t("editor.askAgent", { area: t(`areas.${area}`) }))}>{t("editor.askAgentButton")}</button>
        </div>
      )}
      {doc.data && doc.data.unnumberedRequirements.length > 0 && !doc.data.generated && (
        <div className="banner warn" role="note">
          <Icon name="alert" />
          <span>{t("editor.unnumbered", { count: doc.data.unnumberedRequirements.length })}</span>
        </div>
      )}
      {doc.data && doc.data.warnings.length > 0 && (
        <div className="banner warn" role="note">
          <Icon name="alert" />
          <span>{t("editor.unsupported", { list: doc.data.warnings.map((w) => t(`editor.warnings.${w}`)).join(", ") })}</span>
        </div>
      )}
      {!readOnly && (
        <div className="toolbar" role="toolbar" aria-label={t("editor.toolbar")}>
          {tool("h1", "H1", t("editor.tools.h1"))}
          {tool("h2", "H2", t("editor.tools.h2"))}
          {tool("bold", <b>B</b>, t("editor.tools.bold"))}
          {tool("italic", <i>I</i>, t("editor.tools.italic"))}
          {tool("strike", <s>S</s>, t("editor.tools.strike"))}
          {tool("bullet", "• ≡", t("editor.tools.bullet"))}
          {tool("ordered", "1. ≡", t("editor.tools.ordered"))}
          {tool("quote", "❝", t("editor.tools.quote"))}
          {tool("table", "▦", t("editor.tools.table"))}
          <span className="sep" />
          <button type="button" style={{ color: "var(--violet-text)" }}
            onClick={() => chat.send(t("editor.draftPrompt", { area: t(`areas.${area}`), id: feature.uniqueId }))}>
            ✦ {t("editor.draftByRules")}
          </button>
          <span className="save-state" aria-live="polite">{t(`editor.state.${state}`)}</span>
        </div>
      )}
      <div className={`doc${readOnly ? " readonly" : ""}`} onFocusCapture={() => !readOnly && acquireLock()}>
        <MarkdownEditor
          key={`${area}-${editorKey}`}
          ref={editorRef}
          value={body}
          readOnly={readOnly}
          ariaLabel={t(`areas.${area}`)}
          onReady={(normalized) => {
            baseline.current = normalized;
            current.current = normalized;
          }}
          onChange={onChange}
        />
      </div>
    </>
  );
}
