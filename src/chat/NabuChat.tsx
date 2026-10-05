import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../api/base";
import { ApiError, api } from "../api/client";
import type { List, NabuAgent, NabuConversation, NabuMessage, NabuTone, NabuToolStep, Tone } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { relativeTime } from "../lib/format";
import { useEvent } from "../lib/sse";
import { Icon } from "../components/Icon";
import { Avatar, Modal, useOutside, useToast } from "../components/ui";
import { useRecorder } from "./useRecorder";

// FTR.HMR.CMN-0006 R5, R6: the chat is a window to the personal agent of the
// user in Nabu — the same main conversation, topics and memory as in Nabu and
// Telegram. Every message carries the screen context; the events come from
// Nabu through /api/v1/events as nabu.*.

const NABU_TONES: NabuTone[] = ["business", "friendly", "brief", "mentor"];

/** The tone icons of Hammurapi; "brief" of Nabu is "concise" here. */
export const toneIcon = (tone: NabuTone | undefined): Tone =>
  tone === "brief" ? "concise" : ((tone ?? "business") as Tone);

const nabuKeys = {
  agent: ["nabu", "agent"] as const,
  conversations: ["nabu", "conversations"] as const,
  messages: (id: string) => ["nabu", "messages", id] as const,
};

export function useNabuAgent() {
  return useQuery({ queryKey: nabuKeys.agent, queryFn: () => api.get<NabuAgent>("/api/v1/agent"), staleTime: 60_000, retry: 1 });
}

export function NabuChatPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  const qc = useQueryClient();
  const agent = useNabuAgent();
  const [convId, setConvId] = useState("main");
  const [agentMenu, setAgentMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const [offline, setOffline] = useState(false);
  const conversations = useQuery({
    queryKey: nabuKeys.conversations,
    queryFn: () => api.get<{ items: NabuConversation[] }>("/api/v1/chat/conversations"),
    staleTime: 30_000,
  });
  useEvent("nabu.conversation.updated", () => qc.invalidateQueries({ queryKey: nabuKeys.conversations }));
  useEvent("nabu.agent.updated", () => qc.invalidateQueries({ queryKey: nabuKeys.agent }));
  useEvent("nabu.disconnected", () => setOffline(true));
  useEvent("nabu.connected", () => {
    setOffline(false);
    qc.invalidateQueries({ queryKey: ["nabu"] });
  });

  const items = conversations.data?.items ?? [];
  const main = items.find((c) => c.kind === "main");
  const current = convId === "main" ? main : items.find((c) => c.id === convId);
  const a = agent.data;
  const unavailable = agent.error instanceof ApiError && agent.error.status >= 500;

  return (
    <aside className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <button className="avatar-btn" onMouseDown={(e) => agentMenu && e.stopPropagation()} onClick={() => setAgentMenu((v) => !v)}
            aria-label={t("chat.agentSettings")} aria-expanded={agentMenu} title={t("chat.agentSettings")} disabled={!a}>
            <Avatar agent tone={toneIcon(a?.tone)} name={a?.name ?? "N"} />
          </button>
          <div style={{ minWidth: 0 }}>
            <b>{a?.name ?? "…"}</b>
            <div className="small muted">{a ? t("chat.tone", { tone: t(`nabu.tones.${a.tone}`) }) : ""}</div>
            {a?.model && <div className="small muted mono" title={a.model.connection}>{a.model.name}</div>}
          </div>
          <button className="iconbtn chat-close" style={{ marginLeft: "auto" }} onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && a && <NabuAgentMenu agent={a} onClose={() => setAgentMenu(false)} />}
        <div className="line" style={{ gap: 6, marginTop: 8 }}>
          <select className="inp" style={{ flex: 1 }} value={convId} onChange={(e) => setConvId(e.target.value)} aria-label={t("nabu.conversation")}>
            <option value="main">{t("nabu.mainConversation")}</option>
            {items.filter((c) => c.kind === "topic" && !c.archivedAt).map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button className="iconbtn" onClick={() => setCreating(true)} aria-label={t("nabu.newTopic")} title={t("nabu.newTopic")}>
            <Icon name="plus" />
          </button>
        </div>
        <div className="ctx">
          {chat.subject ? (
            <><span className="fid">{chat.subject.key}</span> {chat.area ? t(`areas.${chat.area}`) : chat.subject.title}</>
          ) : t("nabu.noContext")}
        </div>
        {(offline || unavailable) && <div className="llmerr amber small" role="status">{t("errors.nabu_unavailable")}</div>}
      </div>
      <Conversation key={convId} convId={current?.id ?? convId} agentName={a?.name ?? "Nabu"} />
      {creating && <NewTopic onClose={() => setCreating(false)} onCreated={(c) => { setConvId(c.id); setCreating(false); }} />}
    </aside>
  );
}

function Conversation({ convId, agentName }: { convId: string; agentName: string }) {
  const { t, i18n } = useTranslation();
  const { config } = useSession();
  const chat = useChatContext();
  const qc = useQueryClient();
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, NabuMessage>>({});
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ id: string; fileName: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();

  const history = useInfiniteQuery({
    queryKey: nabuKeys.messages(convId),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<List<NabuMessage>>(`/api/v1/chat/conversations/${convId}/messages?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // "main" is resolved by Nabu; the events carry the real id.
  const realId = history.data?.pages[0]?.items[0]?.conversationId ?? convId;
  const mine = (id: string) => id === convId || id === realId;

  const messages = useMemo(() => {
    const byId = new Map<string, NabuMessage>();
    for (const p of history.data?.pages ?? []) for (const m of p.items) byId.set(m.id, m);
    for (const m of Object.values(overrides)) if (mine(m.conversationId)) byId.set(m.id, { ...byId.get(m.id), ...m });
    return [...byId.values()].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.role === "user" ? -1 : 1));
  }, [history.data, overrides, convId, realId]); // eslint-disable-line react-hooks/exhaustive-deps

  const streaming = messages.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "pending"));
  useEffect(() => {
    if (!streaming) setBusy(false);
  }, [streaming]);
  const lastLength = messages[messages.length - 1]?.text.length;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastLength]);

  const put = (m: Partial<NabuMessage> & { id: string }) =>
    setOverrides((o) => ({ ...o, [m.id]: { ...(o[m.id] ?? ({} as NabuMessage)), ...m } as NabuMessage }));
  const find = (o: Record<string, NabuMessage>, id: string) => o[id] ?? messages.find((x) => x.id === id);

  useEvent("nabu.message.created", (m: NabuMessage) => mine(m.conversationId) && put(m));
  useEvent("nabu.message.delta", (d: { messageId: string; conversationId: string; delta: string }) => {
    if (!mine(d.conversationId)) return;
    setOverrides((o) => {
      const cur = find(o, d.messageId);
      return cur ? { ...o, [d.messageId]: { ...cur, text: (cur.text ?? "") + d.delta, status: "streaming" } } : o;
    });
  });
  useEvent("nabu.tool.step", (d: { messageId: string; conversationId: string; step: NabuToolStep }) => {
    if (!mine(d.conversationId)) return;
    setOverrides((o) => {
      const cur = find(o, d.messageId);
      if (!cur) return o;
      const steps = [...(cur.toolSteps ?? []).filter((s) => s.id !== d.step.id), d.step];
      return { ...o, [d.messageId]: { ...cur, toolSteps: steps } };
    });
  });
  useEvent("nabu.message.done", (m: NabuMessage) => {
    if (!mine(m.conversationId)) return;
    put(m);
    qc.invalidateQueries({ queryKey: nabuKeys.conversations });
  });

  const send = async (body: string) => {
    const msg = body.trim();
    if ((!msg && pending.length === 0) || busy) return;
    setBusy(true);
    const context = chat.subject ? { type: chat.subject.type, key: chat.subject.key, area: chat.area ?? undefined } : undefined;
    try {
      const res = await api.post<{ messageId: string; message: NabuMessage }>(`/api/v1/chat/conversations/${convId}/messages`, {
        text: msg, attachmentIds: pending.map((p) => p.id), context,
      });
      put(res.message);
      setText("");
      setPending([]);
      setTranscript(null);
    } catch (e) {
      setBusy(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  useEffect(() => {
    const out = chat.takeOutbox();
    if (out) send(out);
  }, [chat.outbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = async (m: NabuMessage) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/chat/messages/${m.id}/retry`);
    } catch (e) {
      setBusy(false);
      toast({ kind: "error", title: errorText(t, e) });
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > config.uploadMaxBytes) {
        toast({ kind: "error", title: t("errors.file_too_large", { maxBytes: config.uploadMaxBytes }), text: f.name });
        continue;
      }
      const form = new FormData();
      form.append("file", f);
      try {
        const a = await api.upload<{ attachmentId: string }>("/api/v1/chat/attachments", form);
        setPending((p) => [...p, { id: a.attachmentId, fileName: f.name }]);
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
      const r = await api.upload<{ transcript: string }>("/api/v1/chat/voice", form);
      setTranscript(r.transcript);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast({ kind: "error", title: code === "speech_not_recognized" ? t("chat.voice.notRecognized") : errorText(t, e) });
    }
  };

  return (
    <>
      <div className="msgs" ref={listRef} aria-live="polite">
        {history.hasNextPage && (
          <button className="btn ghost sm" style={{ alignSelf: "center" }} disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
            {t("chat.loadOlder")}
          </button>
        )}
        {history.error && <div className="err-text">{errorText(t, history.error)}</div>}
        {messages.length === 0 && !history.isLoading && !history.error && (
          <div className="muted small" style={{ textAlign: "center", marginTop: 20 }}>{t("nabu.empty", { name: agentName })}</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`m ${m.role === "user" ? "u" : "a"}${m.status === "failed" && m.role === "assistant" ? " err" : ""}`}>
            {m.role === "user" && (
              <div className="tagline">
                {m.context?.key ? t("chat.tagSpec", { id: m.context.key }) : t(`nabu.channels.${m.channel.startsWith("client:") ? "client" : m.channel}`, { defaultValue: m.channel })}
                {" · "}{relativeTime(m.createdAt, i18n.language)}
              </div>
            )}
            <div className="bub">
              {m.text || (m.role === "assistant" && m.status !== "failed" && (
                <span className="typing" aria-label={t("chat.typing")}><i /><i /><i /></span>
              ))}
            </div>
            {m.attachments?.length > 0 && (
              <div className="atts">
                {m.attachments.map((x) => (
                  <a key={x.id} href={apiUrl(`/api/v1/chat/attachments/${x.id}`)}><Icon name="clip" size={12} /> {x.fileName}</a>
                ))}
              </div>
            )}
            {m.toolSteps?.map((s) => (
              <span key={s.id} className="edit">
                <Icon name={s.status === "done" ? "check" : s.status === "error" ? "alert" : "clock"} size={13} />
                {s.summary || `${s.server} · ${s.tool}`}
              </span>
            ))}
            {m.errorClass && (
              <div className={`llmerr${transientLLMError(m.errorClass) ? " amber" : ""}`} role="alert" style={{ marginTop: 6 }}>
                <span>{llmErrorText(t, m.errorClass, t("llm.theConnection"))}</span>
                <div className="row">
                  <button className="btn sm" disabled={busy} onClick={() => retry(m)}><Icon name="refresh" size={14} />{t("llm.retry")}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {transcript !== null ? (
        <div className="transcript">
          <div className="small muted" style={{ marginBottom: 4 }}>{t("chat.voice.review")}</div>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label={t("chat.voice.review")} />
          <div className="row2">
            <button className="btn ghost sm" onClick={() => setTranscript(null)}>{t("common.delete")}</button>
            <button className="btn primary sm" disabled={!transcript.trim() || busy} onClick={() => send(transcript)}>{t("chat.send")}</button>
          </div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="pending-files">
              {pending.map((p) => (
                <span key={p.id} className="chip">
                  <Icon name="clip" size={12} />{p.fileName}
                  <button className="iconbtn" style={{ width: 18, height: 18 }} aria-label={t("common.remove")}
                    onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="composer">
            <button className="iconbtn" aria-label={t("chat.attach")} disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="clip" /></button>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} accept={config.uploadAllowedTypes.join(",")} />
            {recorder.recording ? (
              <div className="rec-box">{t("chat.voice.recording", { seconds: recorder.seconds })}</div>
            ) : (
              <textarea rows={1} value={text} placeholder={t("chat.placeholder", { name: agentName })} aria-label={t("chat.placeholder", { name: agentName })}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(text);
                  }
                }} />
            )}
            <button className={`iconbtn${recorder.recording ? " rec" : ""}`} disabled={!recorder.supported}
              aria-label={recorder.recording ? t("chat.voice.stop") : t("chat.voice.hold")}
              title={recorder.supported ? t("chat.voice.hold") : t("chat.voice.unsupported")}
              onPointerDown={(e) => { e.preventDefault(); if (!recorder.recording) recorder.start(); }}
              onPointerUp={() => recorder.recording && stopAndTranscribe()}
              onPointerLeave={() => recorder.recording && stopAndTranscribe()}>
              <Icon name="mic" />
            </button>
            <button className="iconbtn fill" aria-label={t("chat.send")} disabled={busy || (!text.trim() && pending.length === 0)} onClick={() => send(text)}>
              <Icon name="send" />
            </button>
          </div>
          {recorder.error && <div className="err-text" style={{ padding: "0 12px 8px" }}>{t("chat.voice.micDenied")}</div>}
        </>
      )}
    </>
  );
}

/** Name and tone of the personal agent, saved in Nabu for every channel (R6). */
function NabuAgentMenu({ agent, onClose }: { agent: NabuAgent; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(agent.name);
  const ref = useOutside<HTMLDivElement>(true, onClose);
  const patch = useMutation({
    mutationFn: (body: { name?: string; tone?: NabuTone }) => api.patch<NabuAgent>("/api/v1/agent", body),
    onSuccess: (a) => qc.setQueryData(nabuKeys.agent, a),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const saveName = () => {
    const v = name.trim();
    if (v && v !== agent.name) patch.mutate({ name: v });
  };
  return (
    <div className="menu agent-pop" ref={ref} role="dialog" aria-label={t("chat.agentSettings")}>
      <div className="sec">
        <div className="lab">{t("profile.agentName")}</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="inp" value={name} maxLength={40} aria-label={t("profile.agentName")} autoFocus
            onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </div>
      </div>
      <div className="sec">
        <div className="lab">{t("profile.tone")}</div>
        <div className="chips">
          {NABU_TONES.map((tone) => (
            <button key={tone} className={`chip${agent.tone === tone ? " on" : ""}`} onClick={() => patch.mutate({ tone })}>
              {t(`nabu.tones.${tone}`)}
            </button>
          ))}
        </div>
        <div className="hint">{t("nabu.toneHint")}</div>
      </div>
    </div>
  );
}

function NewTopic({ onClose, onCreated }: { onClose: () => void; onCreated: (c: NabuConversation) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<NabuConversation>("/api/v1/chat/conversations", { title: title.trim() }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: nabuKeys.conversations });
      onCreated(c);
    },
  });
  return (
    <Modal title={t("nabu.newTopic")} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{t("common.create")}</button>
    </>}>
      <div className="field">
        <label htmlFor="nabu-topic">{t("nabu.topicTitle")}</label>
        <input id="nabu-topic" className="inp" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && title.trim() && create.mutate()} />
      </div>
      {create.error && <div className="err-text">{errorText(t, create.error)}</div>}
    </Modal>
  );
}

/** Instead of the chat when Hammurapi works without the agent (R9, design §6). */
export function NoAgentPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  return (
    <aside className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <b>{t("noAgent.title")}</b>
          <button className="iconbtn chat-close" style={{ marginLeft: "auto" }} onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="msgs">
        <div className="noagent">
          <Icon name="cpu" size={22} />
          <div style={{ marginTop: 6 }}><b>{t("noAgent.title")}</b></div>
          <div className="small muted" style={{ marginTop: 4 }}>{t("noAgent.text")}</div>
        </div>
      </div>
    </aside>
  );
}
