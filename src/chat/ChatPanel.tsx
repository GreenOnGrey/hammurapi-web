import { apiUrl } from "../api/base";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api/client";
import { keys } from "../api/queries";
import type {
  Attachment,
  ChatMessage,
  ChatMode,
  ChatSessionInfo,
  List,
} from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { bytes, relativeTime } from "../lib/format";
import { useEvent } from "../lib/sse";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { Avatar, useToast } from "../components/ui";
import { AgentSettings } from "./AgentSettings";
import { useRecorder } from "./useRecorder";

interface Live {
  messageId: string;
  text: string;
  tools: { id: string; title: string; status: string }[];
  error?: string;
  /** FTR.HMR.CMN-0004: the LLM error class and its connection (chat.error). */
  errorClass?: string;
  connectionName?: string;
  done: boolean;
}

export function ChatPanel() {
  const { t, i18n } = useTranslation();
  const { profile, config } = useSession();
  const chat = useChatContext();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<ChatMode>("general");
  const [view, setView] = useState<"chat" | "files">("chat");
  const [agentMenu, setAgentMenu] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();

  // The mode follows the issue, feature or release on the screen; the user
  // can switch back. A new subject resets it during render, without an effect.
  const subjectKey = chat.subject?.key;
  const [modeOf, setModeOf] = useState<string | undefined>(undefined);
  if (modeOf !== subjectKey) {
    setModeOf(subjectKey);
    setMode(subjectKey ? "spec" : "general");
  }

  const history = useInfiniteQuery({
    queryKey: keys.chat,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<List<ChatMessage>>(
        `/api/v1/chat/history?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const serverMsgs = (history.data?.pages ?? [])
    .flatMap((p) => p.items)
    .toReversed();
  const known = new Set(serverMsgs.map((m) => m.id));
  const messages = [...serverMsgs, ...local.filter((m) => !known.has(m.id))];

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, live?.text, live?.tools.length, view]); // oxlint-disable-line react/exhaustive-effect-dependencies -- the list follows new messages and the growth of the answer

  useEvent("agent.token", (d: { messageId: string; text: string }) =>
    setLive((l) =>
      l && l.messageId === d.messageId ? { ...l, text: l.text + d.text } : l,
    ),
  );
  useEvent(
    "agent.tool_call",
    (d: {
      messageId: string;
      toolCallId: string;
      title: string;
      status: string;
    }) =>
      setLive((l) => {
        if (!l || l.messageId !== d.messageId) return l;
        const tools = l.tools.filter((x) => x.id !== d.toolCallId);
        const prev = l.tools.find((x) => x.id === d.toolCallId);
        return {
          ...l,
          tools: [
            ...tools,
            {
              id: d.toolCallId,
              title: d.title || prev?.title || "",
              status: d.status || prev?.status || "",
            },
          ],
        };
      }),
  );
  useEvent("agent.done", (d: { messageId: string }) => {
    setLive((l) =>
      l && l.messageId === d.messageId ? { ...l, done: true } : l,
    );
    setSending(false);
    qc.invalidateQueries({ queryKey: keys.chat });
    qc.invalidateQueries({ queryKey: keys.attachments });
  });
  useEvent(
    "agent.error",
    (d: { messageId: string; code: string; message: string }) => {
      // chat.error comes first for LLM errors and is more precise: keep its text.
      setLive((l) =>
        l && l.messageId === d.messageId && !l.errorClass
          ? {
              ...l,
              error: t(`chat.errors.${d.code}`, { defaultValue: d.message }),
              done: true,
            }
          : l,
      );
      setSending(false);
    },
  );
  useEvent(
    "chat.error",
    (d: {
      messageId: string;
      errorClass: string;
      connectionName?: string;
      text: string;
    }) => {
      if (!d.errorClass) return;
      setLive((l) =>
        l && l.messageId === d.messageId
          ? {
              ...l,
              errorClass: d.errorClass,
              connectionName: d.connectionName ?? "",
              error: llmErrorText(t, d.errorClass, d.connectionName ?? ""),
              done: true,
            }
          : l,
      );
      setSending(false);
      qc.invalidateQueries({ queryKey: keys.chat });
    },
  );

  // The model of the chat under the agent's name (design §3.7).
  const session = useQuery({
    queryKey: keys.chatSession,
    queryFn: () => api.get<ChatSessionInfo>("/api/v1/chat/session"),
    staleTime: 60_000,
  });
  useEvent("chat.model", (d: { model: string; connectionName: string }) =>
    qc.setQueryData<ChatSessionInfo>(keys.chatSession, (old) => ({
      thinking: "",
      ...old,
      model: d.model,
      connectionName: d.connectionName,
      configured: true,
    })),
  );

  const retried = new Set(messages.map((m) => m.retryOf).filter(Boolean));
  const retry = async (m: ChatMessage) => {
    if (sending) return;
    setSending(true);
    try {
      const res = await api.post<{ messageId: string; createdAt: string }>(
        `/api/v1/chat/messages/${m.id}/retry`,
      );
      setLocal((l) => [
        ...l,
        {
          ...m,
          id: res.messageId,
          createdAt: res.createdAt,
          errorClass: null,
          retryOf: m.id,
        },
      ]);
      setLive({ messageId: res.messageId, text: "", tools: [], done: false });
      qc.invalidateQueries({ queryKey: keys.chat });
    } catch (e) {
      setSending(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  // Drop the live bubble once the stored agent message has arrived: only
  // when a refetch of the history ends, not as soon as the answer is done —
  // otherwise the answer would disappear until the history brings it.
  useEffect(() => {
    if (live?.done && !live.error && history.isFetched && !history.isFetching)
      setLive(null); // oxlint-disable-line react/set-state-in-effect
  }, [history.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps, react/exhaustive-effect-dependencies

  const send = async (msg: string, isVoice = false) => {
    const body = msg.trim();
    if (!body || sending) return;
    if (mode === "spec" && !chat.subject) return;
    setSending(true);
    const context =
      mode === "spec" && chat.subject
        ? { type: chat.subject.type, key: chat.subject.key, area: chat.area }
        : null;
    try {
      const res = await api.post<{ messageId: string; createdAt: string }>(
        "/api/v1/chat/messages",
        {
          text: body,
          mode,
          isVoice,
          context: context
            ? {
                type: context.type,
                key: context.key,
                area: context.area ?? undefined,
              }
            : undefined,
          attachmentIds: pending.map((p) => p.id),
        },
      );
      setLocal((l) => [
        ...l,
        {
          id: res.messageId,
          role: "user",
          mode,
          context,
          content: body,
          isVoice,
          createdAt: res.createdAt,
          attachments: pending.map((p) => ({
            id: p.id,
            fileName: p.fileName,
            mimeType: p.mimeType,
          })),
        },
      ]);
      setLive({ messageId: res.messageId, text: "", tools: [], done: false });
      setText("");
      setPending([]);
      setTranscript(null);
    } catch (e) {
      setSending(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  // Messages queued from elsewhere ("Draft by rules").
  // Sending is a reaction to a command from another screen, so it lives in
  // an effect and runs once per queued message.
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    const out = chat.takeOutbox();
    if (out) send(out); // oxlint-disable-line react/set-state-in-effect
  }, [chat.outbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > config.uploadMaxBytes) {
        toast({
          kind: "error",
          title: t("errors.file_too_large", {
            maxBytes: config.uploadMaxBytes,
          }),
          text: f.name,
        });
        continue;
      }
      const form = new FormData();
      form.append("file", f);
      try {
        const a = await api.upload<Attachment>("/api/v1/attachments", form);
        setPending((p) => [...p, a]);
      } catch (e) {
        toast({ kind: "error", title: errorText(t, e), text: f.name });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const stopAndTranscribe = async () => {
    const blob = await recorder.stop();
    if (!blob) return;
    const form = new FormData();
    form.append("audio", blob, "voice.webm");
    try {
      const r = await api.upload<{ transcript: string }>(
        "/api/v1/chat/voice",
        form,
      );
      setTranscript(r.transcript);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast({
        kind: "error",
        title:
          code === "speech_not_recognized"
            ? t("chat.voice.notRecognized")
            : errorText(t, e),
      });
    }
  };

  const tagline = (m: ChatMessage) =>
    m.mode === "spec"
      ? t("chat.tagSpec", { id: m.context?.key ?? "" })
      : t("chat.tagGeneral");

  return (
    <aside
      className={`chat${chat.open ? " open" : ""}`}
      aria-label={t("chat.title")}
    >
      <div className="chat-h">
        <div className="who">
          {view === "files" ? (
            <>
              <button
                className="iconbtn"
                onClick={() => setView("chat")}
                aria-label={t("chat.backToChat")}
              >
                <Icon name="back" />
              </button>
              <b>{t("chat.myFiles")}</b>
            </>
          ) : (
            <>
              <button
                className="avatar-btn"
                // The popover closes on an outside mousedown; keep this click a toggle.
                onMouseDown={(e) => agentMenu && e.stopPropagation()}
                onClick={() => setAgentMenu((v) => !v)}
                aria-label={t("chat.agentSettings")}
                aria-expanded={agentMenu}
                title={t("chat.agentSettings")}
              >
                <Avatar agent tone={profile.agentTone} name={profile.agentName} />
              </button>
              <div>
                <b>{profile.agentName}</b>
                <div className="small muted">
                  {t("chat.tone", { tone: t(`tones.${profile.agentTone}`) })}
                </div>
                {session.data?.configured && session.data.model && (
                  <div
                    className="small muted mono"
                    title={session.data.connectionName}
                  >
                    {session.data.model}
                  </div>
                )}
              </div>
              <button
                className="iconbtn"
                style={{ marginLeft: "auto" }}
                onClick={() => setView("files")}
                aria-label={t("chat.myFiles")}
              >
                <Icon name="files" />
              </button>
            </>
          )}
          <button
            className="iconbtn chat-close"
            style={view === "files" ? { marginLeft: "auto" } : undefined}
            onClick={() => chat.setOpen(false)}
            aria-label={t("common.close")}
          >
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && view === "chat" && (
          <AgentSettings onClose={() => setAgentMenu(false)} />
        )}
        {view === "chat" && (
          <>
            <div className="seg" role="group" aria-label={t("chat.mode")}>
              <button
                aria-pressed={mode === "spec"}
                disabled={!chat.subject}
                onClick={() => setMode("spec")}
              >
                {t("chat.modeSpec")}
              </button>
              <button
                aria-pressed={mode === "general"}
                onClick={() => setMode("general")}
              >
                {t("chat.modeGeneral")}
              </button>
            </div>
            <div className="ctx">
              {mode === "spec" && chat.subject ? (
                <>
                  <span className="fid">{chat.subject.key}</span>{" "}
                  {chat.area ? t(`areas.${chat.area}`) : chat.subject.title}
                </>
              ) : (
                t("chat.generalHint")
              )}
            </div>
          </>
        )}
      </div>

      {view === "files" ? (
        <FilesView />
      ) : (
        <>
          <div className="msgs" ref={listRef} aria-live="polite">
            {history.hasNextPage && (
              <button
                className="btn ghost sm"
                style={{ alignSelf: "center" }}
                disabled={history.isFetchingNextPage}
                onClick={() => history.fetchNextPage()}
              >
                {t("chat.loadOlder")}
              </button>
            )}
            {messages.length === 0 && !live && (
              <div
                className="muted small"
                style={{ textAlign: "center", marginTop: 20 }}
              >
                {t("chat.empty", { name: profile.agentName })}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`m ${m.role === "user" ? "u" : "a"}`}>
                {m.role === "user" && (
                  <div className="tagline">
                    {tagline(m)}
                    {m.isVoice && ` · ${t("chat.voiceTag")}`} ·{" "}
                    {relativeTime(m.createdAt, i18n.language)}
                  </div>
                )}
                {m.role === "user"
                  ? <div className="bub">{m.content}</div>
                  : <div className="bub md"><Markdown text={m.content} /></div>}
                {m.attachments.length > 0 && (
                  <div className="atts">
                    {m.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={apiUrl(`/api/v1/attachments/${a.id}`)}
                      >
                        <Icon name="clip" size={12} /> {a.fileName}
                      </a>
                    ))}
                  </div>
                )}
                {m.role === "user" &&
                  !retried.has(m.id) &&
                  (live?.messageId === m.id
                    ? live.errorClass
                    : m.errorClass) && (
                    <LLMErrorCard
                      errorClass={
                        (live?.messageId === m.id
                          ? live.errorClass
                          : m.errorClass) ?? ""
                      }
                      connection={
                        live?.messageId === m.id
                          ? (live.connectionName ?? "")
                          : ""
                      }
                      disabled={sending}
                      onRetry={() => retry(m)}
                    />
                  )}
              </div>
            ))}
            {live && !live.errorClass && (
              <div className={`m a${live.error ? " err" : ""}`}>
                <div className={`bub${!live.error && live.text ? " md" : ""}`}>
                  {live.error
                    ? live.error
                    : live.text ? <Markdown text={live.text} /> : (
                        <span className="typing" aria-label={t("chat.typing")}>
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                </div>
                {live.tools.map((tc) => (
                  <span key={tc.id} className="edit">
                    <Icon
                      name={tc.status === "completed" ? "check" : "clock"}
                      size={13}
                    />
                    {/edit_spec/.test(tc.title)
                      ? t("chat.toolEdit")
                      : tc.title || t("chat.toolRunning")}
                  </span>
                ))}
              </div>
            )}
          </div>

          {transcript !== null ? (
            <div className="transcript">
              <div className="small muted" style={{ marginBottom: 4 }}>
                {t("chat.voice.review")}
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                aria-label={t("chat.voice.review")}
              />
              <div className="row2">
                <button
                  className="btn ghost sm"
                  onClick={() => setTranscript(null)}
                >
                  {t("common.delete")}
                </button>
                <button
                  className="btn primary sm"
                  disabled={!transcript.trim() || sending}
                  onClick={() => send(transcript, true)}
                >
                  {t("chat.send")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="pending-files">
                  {pending.map((p) => (
                    <span key={p.id} className="chip">
                      <Icon name="clip" size={12} />
                      {p.fileName}
                      <button
                        className="iconbtn"
                        style={{ width: 18, height: 18 }}
                        aria-label={t("common.remove")}
                        onClick={() =>
                          setPending((x) => x.filter((y) => y.id !== p.id))
                        }
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="composer">
                <button
                  className="iconbtn"
                  aria-label={t("chat.attach")}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Icon name="clip" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => attach(e.target.files)}
                  accept={config.uploadAllowedTypes.join(",")}
                />
                {recorder.recording ? (
                  <div className="rec-box">
                    {t("chat.voice.recording", { seconds: recorder.seconds })}
                  </div>
                ) : (
                  <textarea
                    rows={1}
                    value={text}
                    placeholder={t("chat.placeholder", {
                      name: profile.agentName,
                    })}
                    aria-label={t("chat.placeholder", {
                      name: profile.agentName,
                    })}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        send(text);
                      }
                    }}
                  />
                )}
                <button
                  className={`iconbtn${recorder.recording ? " rec" : ""}`}
                  disabled={!recorder.supported}
                  aria-label={
                    recorder.recording
                      ? t("chat.voice.stop")
                      : t("chat.voice.hold")
                  }
                  title={
                    recorder.supported
                      ? t("chat.voice.hold")
                      : t("chat.voice.unsupported")
                  }
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!recorder.recording) recorder.start();
                  }}
                  onPointerUp={() => recorder.recording && stopAndTranscribe()}
                  onPointerLeave={() =>
                    recorder.recording && stopAndTranscribe()
                  }
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      if (recorder.recording) stopAndTranscribe();
                      else recorder.start();
                    }
                  }}
                >
                  <Icon name="mic" />
                </button>
                {sending ? (
                  <button
                    className="iconbtn fill"
                    aria-label={t("chat.stop")}
                    onClick={() =>
                      api.post("/api/v1/chat/cancel").catch(() => undefined)
                    }
                  >
                    <Icon name="stop" />
                  </button>
                ) : (
                  <button
                    className="iconbtn fill"
                    aria-label={t("chat.send")}
                    disabled={
                      !text.trim() || (mode === "spec" && !chat.subject)
                    }
                    onClick={() => send(text)}
                  >
                    <Icon name="send" />
                  </button>
                )}
              </div>
              {recorder.error && (
                <div className="err-text" style={{ padding: "0 12px 8px" }}>
                  {t("chat.voice.micDenied")}
                </div>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}

/** An LLM error under the message it stopped, with "Retry" (design §3.7, §4):
 * red for errors of the connection, amber for temporary ones. */
function LLMErrorCard({
  errorClass,
  connection,
  disabled,
  onRetry,
}: {
  errorClass: string;
  connection: string;
  disabled: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`llmerr${transientLLMError(errorClass) ? " amber" : ""}`}
      role="alert"
      style={{ marginTop: 6 }}
    >
      <span>
        {llmErrorText(t, errorClass, connection || t("llm.theConnection"))}
      </span>
      <div className="row">
        <button className="btn sm" disabled={disabled} onClick={onRetry}>
          <Icon name="refresh" size={14} />
          {t("llm.retry")}
        </button>
      </div>
    </div>
  );
}

function FilesView() {
  const { t, i18n } = useTranslation();
  const files = useQuery({
    queryKey: keys.attachments,
    queryFn: () => api.get<List<Attachment>>("/api/v1/attachments?limit=200"),
  });
  return (
    <div className="msgs">
      <div className="files">
        {files.data?.items.length === 0 && (
          <p className="muted small">{t("chat.noFiles")}</p>
        )}
        {files.data?.items.map((f) => (
          <a
            key={f.id}
            className="f"
            href={apiUrl(`/api/v1/attachments/${f.id}`)}
          >
            <div className="thumb">
              {(f.fileName.split(".").pop() ?? "").slice(0, 4).toUpperCase()}
            </div>
            <div>
              {f.fileName}
              <div className="muted">
                {relativeTime(f.createdAt, i18n.language)},{" "}
                {bytes(f.sizeBytes, i18n.language)},{" "}
                {f.feature ??
                  (f.mode === "general"
                    ? t("chat.tagGeneral")
                    : t("chat.notSent"))}
              </div>
            </div>
          </a>
        ))}
      </div>
      <div className="small muted">{t("chat.retention")}</div>
    </div>
  );
}
