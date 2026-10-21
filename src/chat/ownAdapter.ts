import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useToast } from "@green-on-grey/ui-kit";
import type { ChatMark, ChatMessage as KitMessage, ChatProps, ChatStep } from "@green-on-grey/ui-kit/chat";
import { apiUrl } from "../api/base";
import { ApiError, api } from "../api/client";
import { keys } from "../api/queries";
import type { Attachment, ChatMessage, ChatMode, ChatSessionInfo, List } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { useEvent } from "../lib/sse";

// The adapter of the built-in chat of Hammurapi (FTR.NAB.CMN-0005 R12, R14,
// tech §5): the requests, the agent.* events and the turning of the history and
// of the answer being written into the view types of the kit.

/** The answer being written: it lives here until the history brings the stored message. */
export interface Live {
  messageId: string;
  text: string;
  tools: { id: string; title: string; status: string }[];
  error?: string;
  /** FTR.HMR.CMN-0004: the LLM error class and its connection (chat.error). */
  errorClass?: string;
  connectionName?: string;
  done: boolean;
}

/** The id of the line the kit draws for the answer to a message of the user:
 * the answer being written or the error that stopped it. */
const ANSWER = ":answer";
export const answerOf = (messageId: string) => messageId + ANSWER;
export const askedBy = (id: string) => (id.endsWith(ANSWER) ? id.slice(0, -ANSWER.length) : id);

/** The caption of a message of the user (FTR.NAB.CMN-0005 design §6.4): the
 * specification it was asked about and the mark of a voice message. A general
 * question typed by hand has none. */
export function ownMark(t: TFunction, m: Pick<ChatMessage, "mode" | "context" | "isVoice">): ChatMark | undefined {
  const spec = m.mode === "spec" ? t("chat.tagSpec", { id: m.context?.key ?? "" }) : "";
  if (!spec && !m.isVoice) return undefined;
  return { icon: spec ? "files" : "mic", text: [spec, m.isVoice ? t("chat.voiceTag") : ""].filter(Boolean).join(" · ") };
}

export function liveSteps(t: TFunction, live: Live): ChatStep[] {
  return live.tools.map((tc) => ({
    id: tc.id,
    text: /edit_spec/.test(tc.title) ? t("chat.toolEdit") : tc.title || t("chat.toolRunning"),
    status: tc.status === "completed" ? "done" : "running",
  }));
}

/** The history and the answer being written as the lines the kit draws. An LLM
 * error belongs to the message of the user it stopped; the kit draws it as the
 * failed answer under that message, with "Retry". */
export function toOwnMessages(t: TFunction, messages: ChatMessage[], live: Live | null): KitMessage[] {
  const retried = new Set(messages.map((m) => m.retryOf).filter(Boolean));
  const out: KitMessage[] = [];
  for (const m of messages) {
    if (m.role === "agent") {
      out.push({ id: m.id, role: "assistant", text: m.content, createdAt: m.createdAt, status: "done" });
      continue;
    }
    out.push({
      id: m.id, role: "user", text: m.content, createdAt: m.createdAt, status: "done", mark: ownMark(t, m),
      attachments: m.attachments.map((a) => ({ id: a.id, fileName: a.fileName, href: apiUrl(`/api/v1/attachments/${a.id}`) })),
    });
    const mine = live?.messageId === m.id ? live : null;
    const errorClass = mine ? mine.errorClass : m.errorClass;
    if (errorClass && !retried.has(m.id)) {
      out.push({
        id: answerOf(m.id), role: "assistant", text: "", createdAt: m.createdAt, status: "failed",
        error: { text: llmErrorText(t, errorClass, mine?.connectionName || t("llm.theConnection")), transient: transientLLMError(errorClass) },
      });
    } else if (mine) {
      out.push({
        id: answerOf(m.id), role: "assistant", text: mine.error ? "" : mine.text, createdAt: m.createdAt,
        status: mine.error ? "failed" : mine.done ? "done" : mine.text ? "streaming" : "pending",
        steps: liveSteps(t, mine),
        error: mine.error ? { text: mine.error, transient: false } : undefined,
      });
    }
  }
  return out;
}

/** The built-in chat: what the `Chat` of the kit needs, apart from the look. */
export function useOwnChat(mode: ChatMode): Pick<ChatProps,
  "messages" | "loading" | "hasOlder" | "loadingOlder" | "busy" | "upload" | "onSend" | "onLoadOlder" | "onRetry" | "onCancel" | "onUpload" | "onTranscribe">
  & { session: ChatSessionInfo | undefined } {
  const { t } = useTranslation();
  const { config } = useSession();
  const chat = useChatContext();
  const qc = useQueryClient();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  // what was uploaded for the message being written: sending needs the names and the types
  const uploaded = useRef(new Map<string, Attachment>());
  const fail = (e: unknown, text?: string) => toast({ kind: "error", title: errorText(t, e), text });

  const history = useInfiniteQuery({
    queryKey: keys.chat,
    initialPageParam: "",
    queryFn: ({ pageParam }) => api.get<List<ChatMessage>>(`/api/v1/chat/history?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const raw = useMemo(() => {
    const server = (history.data?.pages ?? []).flatMap((p) => p.items).toReversed();
    const known = new Set(server.map((m) => m.id));
    return [...server, ...local.filter((m) => !known.has(m.id))];
  }, [history.data, local]);

  useEvent("agent.token", (d: { messageId: string; text: string }) =>
    setLive((l) => (l && l.messageId === d.messageId ? { ...l, text: l.text + d.text } : l)));
  useEvent("agent.tool_call", (d: { messageId: string; toolCallId: string; title: string; status: string }) =>
    setLive((l) => {
      if (!l || l.messageId !== d.messageId) return l;
      const prev = l.tools.find((x) => x.id === d.toolCallId);
      const tools = l.tools.filter((x) => x.id !== d.toolCallId);
      return { ...l, tools: [...tools, { id: d.toolCallId, title: d.title || prev?.title || "", status: d.status || prev?.status || "" }] };
    }));
  useEvent("agent.done", (d: { messageId: string }) => {
    chat.markUnread(); // the answer came while the chat was folded (FTR.HMR.SPEC-0001 R10)
    setLive((l) => (l && l.messageId === d.messageId ? { ...l, done: true } : l));
    setSending(false);
    qc.invalidateQueries({ queryKey: keys.chat });
    qc.invalidateQueries({ queryKey: keys.attachments });
  });
  useEvent("agent.error", (d: { messageId: string; code: string; message: string }) => {
    // chat.error comes first for LLM errors and is more precise: keep its text.
    setLive((l) => (l && l.messageId === d.messageId && !l.errorClass
      ? { ...l, error: t(`chat.errors.${d.code}`, { defaultValue: d.message }), done: true } : l));
    setSending(false);
  });
  useEvent("chat.error", (d: { messageId: string; errorClass: string; connectionName?: string; text: string }) => {
    if (!d.errorClass) return;
    setLive((l) => (l && l.messageId === d.messageId
      ? { ...l, errorClass: d.errorClass, connectionName: d.connectionName ?? "", error: llmErrorText(t, d.errorClass, d.connectionName ?? ""), done: true } : l));
    setSending(false);
    qc.invalidateQueries({ queryKey: keys.chat });
  });

  // The model of the chat under the agent's name (design §3.7).
  const session = useQuery({ queryKey: keys.chatSession, queryFn: () => api.get<ChatSessionInfo>("/api/v1/chat/session"), staleTime: 60_000 });
  useEvent("chat.model", (d: { model: string; connectionName: string }) =>
    qc.setQueryData<ChatSessionInfo>(keys.chatSession, (old) => ({ thinking: "", ...old, model: d.model, connectionName: d.connectionName, configured: true })));

  // Drop the answer being written once the stored message has arrived: only
  // when a refetch of the history ends, not as soon as the answer is done —
  // otherwise the answer would disappear until the history brings it.
  useEffect(() => {
    if (live?.done && !live.error && history.isFetched && !history.isFetching) setLive(null); // oxlint-disable-line react/set-state-in-effect
  }, [history.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps, react/exhaustive-effect-dependencies

  const send = async (text: string, attachmentIds: string[], isVoice: boolean) => {
    // a question about a specification needs the specification on the screen
    if (mode === "spec" && !chat.subject) throw new Error("no subject");
    setSending(true);
    const context = mode === "spec" && chat.subject ? { type: chat.subject.type, key: chat.subject.key, area: chat.area } : null;
    try {
      const res = await api.post<{ messageId: string; createdAt: string }>("/api/v1/chat/messages", {
        text, mode, isVoice, attachmentIds,
        context: context ? { type: context.type, key: context.key, area: context.area ?? undefined } : undefined,
      });
      const attachments = attachmentIds.flatMap((id) => {
        const a = uploaded.current.get(id);
        return a ? [{ id: a.id, fileName: a.fileName, mimeType: a.mimeType }] : [];
      });
      setLocal((l) => [...l, { id: res.messageId, role: "user", mode, context, content: text, isVoice, createdAt: res.createdAt, attachments }]);
      setLive({ messageId: res.messageId, text: "", tools: [], done: false });
      uploaded.current.clear();
    } catch (e) {
      setSending(false);
      fail(e);
      throw e;
    }
  };

  // Messages queued from elsewhere ("Draft by rules").
  // Sending is a reaction to a command from another screen, so it lives in
  // an effect and runs once per queued message.
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    const out = chat.takeOutbox();
    if (out && !sending) void send(out, [], false).catch(() => undefined); // oxlint-disable-line react/set-state-in-effect
  }, [chat.outbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => toOwnMessages(t, raw, live), [raw, live, t]);

  return {
    messages, session: session.data,
    busy: sending,
    loading: history.isLoading,
    hasOlder: history.hasNextPage,
    loadingOlder: history.isFetchingNextPage,
    upload: { maxBytes: config.uploadMaxBytes, accept: config.uploadAllowedTypes.join(",") },
    onLoadOlder: () => void history.fetchNextPage(),
    onSend: send,
    onCancel: () => void api.post("/api/v1/chat/cancel").catch(() => undefined),
    async onRetry(id) {
      const m = raw.find((x) => x.id === askedBy(id));
      if (!m || sending) return;
      setSending(true);
      try {
        const res = await api.post<{ messageId: string; createdAt: string }>(`/api/v1/chat/messages/${m.id}/retry`);
        setLocal((l) => [...l, { ...m, id: res.messageId, createdAt: res.createdAt, errorClass: null, retryOf: m.id }]);
        setLive({ messageId: res.messageId, text: "", tools: [], done: false });
        qc.invalidateQueries({ queryKey: keys.chat });
      } catch (e) {
        setSending(false);
        fail(e);
      }
    },
    async onUpload(file) {
      const form = new FormData();
      form.append("file", file);
      try {
        const a = await api.upload<Attachment>("/api/v1/attachments", form);
        uploaded.current.set(a.id, a);
        return { id: a.id, fileName: a.fileName };
      } catch (e) {
        fail(e, file.name);
        return null;
      }
    },
    async onTranscribe(recording) {
      const form = new FormData();
      form.append("audio", recording, "voice.webm");
      try {
        return (await api.upload<{ transcript: string }>("/api/v1/chat/voice", form)).transcript;
      } catch (e) {
        // an unrecognized speech is told by the chat itself
        if (e instanceof ApiError && e.code === "speech_not_recognized") return "";
        fail(e);
        return null;
      }
    },
  };
}
