import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useToast } from "@green-on-grey/ui-kit";
import type { ChatConversation, ChatMark, ChatMessage, ChatProps } from "@green-on-grey/ui-kit/chat";
import { apiUrl } from "../api/base";
import { ApiError, api } from "../api/client";
import type { List, NabuAgent, NabuAgentWait, NabuConversation, NabuMessage, NabuToolStep } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { errorText } from "../lib/errors";
import { relativeTime } from "../lib/format";
import { llmErrorText, transientLLMError } from "../lib/llm";
import { useEvent } from "../lib/sse";
import { keys } from "../api/queries";
import type { IssueTopic } from "../api/types";
import { noticeContent, revisionContent } from "./discoveryCards";

// The adapter of the window to the agent of Nabu (FTR.HMR.CMN-0006 R5, R6;
// FTR.NAB.CMN-0005 R12, tech §5): the requests through Hammurapi, the nabu.*
// events and the turning of the answers into the view types of the kit.

export const nabuKeys = {
  agent: ["nabu", "agent"] as const,
  conversations: ["nabu", "conversations"] as const,
  messages: (id: string) => ["nabu", "messages", id] as const,
};

export function useNabuAgent(enabled = true) {
  return useQuery({ queryKey: nabuKeys.agent, queryFn: () => api.get<NabuAgent>("/api/v1/agent"), staleTime: 60_000, retry: 1, enabled });
}

/** The caption of a message (FTR.NAB.CMN-0005 design §6.4): the specification it
 * was written about, or the channel it came from. A message written here about
 * nothing in particular has none. */
export function nabuMark(t: TFunction, m: Pick<NabuMessage, "channel" | "context">): ChatMark | undefined {
  if (m.context?.key) return { icon: "files", text: t("chat.tagSpec", { id: m.context.key }) };
  const ch = m.channel;
  if (ch === "web" || ch.startsWith("client:")) return undefined;
  return { icon: ch === "telegram" ? "tg" : ch === "email" ? "mail" : "msg", text: t(`nabu.channels.${ch}`, { defaultValue: ch }) };
}

/** The line of a tool step: "server: the first line of the result", as the core of Nabu writes it. */
export function nabuStepText(s: NabuToolStep): string {
  const rest = s.summary.includes(" — ") ? s.summary.slice(s.summary.indexOf(" — ") + 3) : s.tool;
  return s.server ? `${s.server}: ${rest}` : rest;
}

/** A message of Nabu as the kit draws it. */
export function toNabuChatMessage(t: TFunction, m: NabuMessage, wait: NabuAgentWait | null): ChatMessage {
  const base = { id: m.id, text: m.text, createdAt: m.createdAt, status: m.status, mark: nabuMark(t, m) };
  if (m.role === "notice") {
    // FTR.NAB.CHAT-0002: a notice of a product, not words of the agent; FTR.HMR.DISC-0001: the card of the result
    const name = m.clientName ?? m.channel.replace(/^client:/, "");
    return { ...base, role: "assistant", variant: "notice", mark: { icon: "plug", text: name.replace(/^./, (c) => c.toUpperCase()) }, content: noticeContent(m) };
  }
  if (m.role === "user") {
    return {
      ...base, role: "user",
      attachments: (m.attachments ?? []).map((a) => ({ id: a.id, fileName: a.fileName, href: apiUrl(`/api/v1/chat/attachments/${a.id}`) })),
      wait: wait?.messageId === m.id ? (wait.state === "queued" ? { state: "queued", position: wait.position ?? 0 } : { state: "starting" }) : undefined,
    };
  }
  return {
    ...base, role: "assistant",
    steps: (m.toolSteps ?? []).map((s) => ({ id: s.id, text: nabuStepText(s), title: s.summary, status: s.status })),
    // FTR.HMR.DISC-0001 design §3.3: the instruction to the researcher is a card under the answer
    content: revisionContent(m),
    error: m.errorClass ? { text: llmErrorText(t, m.errorClass, t("llm.theConnection")), transient: transientLLMError(m.errorClass) } : undefined,
  };
}

export function toNabuConversation(t: TFunction, c: NabuConversation, locale: string): ChatConversation {
  return {
    id: c.kind === "main" ? "main" : c.id,
    group: c.archivedAt ? "archive" : c.kind === "main" ? "main" : "topic",
    title: c.kind === "main" ? t("nabu.mainConversation") : (c.title ?? ""),
    when: relativeTime(c.lastMessageAt ?? c.createdAt, locale),
  };
}

/** The conversations of the user in Nabu and the state of the link to it. */
export function useNabuConversations() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
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
  const items = conversations.data?.items;
  const rows = useMemo(() => (items ?? []).map((c) => toNabuConversation(t, c, i18n.language)), [items, t, i18n.language]);
  /** Rejects with the text the dialog of a new topic shows. */
  const create = async (title: string): Promise<string> => {
    try {
      const c = await api.post<NabuConversation>("/api/v1/chat/conversations", { title });
      qc.invalidateQueries({ queryKey: nabuKeys.conversations });
      return c.id;
    } catch (e) {
      throw new Error(errorText(t, e), { cause: e });
    }
  };
  return { rows, offline, create };
}

/** One conversation with the agent of Nabu: what the `Chat` of the kit needs, apart from the look.
 * With issueKey it is the topic of the issue (FTR.HMR.DISC-0001 R2): convId null is
 * the draft, and messages go through the issue, which creates the topic with the first one. */
export function useNabuConversation(convId: string | null, issueKey?: string): Pick<ChatProps,
  "messages" | "loading" | "historyError" | "hasOlder" | "loadingOlder" | "busy" | "upload" | "onSend" | "onLoadOlder" | "onRetry" | "onUpload" | "onTranscribe"> {
  const { t } = useTranslation();
  const { config } = useSession();
  const chat = useChatContext();
  const qc = useQueryClient();
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, NabuMessage>>({});
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown, text?: string) => toast({ kind: "error", title: errorText(t, e), text });

  const history = useInfiniteQuery({
    queryKey: nabuKeys.messages(convId ?? `draft:${issueKey}`),
    enabled: convId !== null,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<List<NabuMessage>>(`/api/v1/chat/conversations/${convId}/messages?limit=50${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // "main" is resolved by Nabu; the events carry the real id.
  const realId = history.data?.pages[0]?.items[0]?.conversationId ?? convId;
  const mine = (id: string) => convId !== null && (id === convId || id === realId);

  const raw = useMemo(() => {
    const byId = new Map<string, NabuMessage>();
    for (const p of history.data?.pages ?? []) for (const m of p.items) byId.set(m.id, m);
    for (const m of Object.values(overrides)) {
      if (m.conversationId === convId || m.conversationId === realId) byId.set(m.id, { ...byId.get(m.id), ...m });
    }
    return [...byId.values()].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.role === "user" ? -1 : 1));
  }, [history.data, overrides, convId, realId]);

  const streaming = raw.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "pending"));
  // The composer is locked from sending until the answer stops streaming:
  // the end of the stream comes from the server, so it is an effect.
  useEffect(() => {
    if (!streaming) setBusy(false); // oxlint-disable-line react/set-state-in-effect
  }, [streaming]);

  const put = (m: Partial<NabuMessage> & { id: string }) =>
    setOverrides((o) => ({ ...o, [m.id]: { ...(o[m.id] ?? ({} as NabuMessage)), ...m } as NabuMessage }));
  const find = (o: Record<string, NabuMessage>, id: string) => o[id] ?? raw.find((x) => x.id === id);

  // FTR.NAB.CMN-0004 R7, R12: the pod of the agent starts, or the turn waits
  // for a place; the line goes with the first event of the answer.
  const [wait, setWait] = useState<NabuAgentWait | null>(null);
  useEvent("nabu.agent.state", (d: NabuAgentWait) => {
    if (mine(d.conversationId)) setWait(d);
  });
  useEvent("nabu.message.created", (m: NabuMessage) => {
    // a notification of the agent comes whole (FTR.HMR.SPEC-0001 R10), and so does a notice (FTR.HMR.DISC-0001 NT-07)
    if ((m.role === "assistant" && m.status === "done") || m.role === "notice") chat.markUnread();
    if (!mine(m.conversationId)) return;
    put(m);
    if (m.role === "assistant") setWait(null);
  });
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
    if (m.role === "assistant") chat.markUnread();
    if (!mine(m.conversationId)) return;
    put(m);
    setWait(null);
    qc.invalidateQueries({ queryKey: nabuKeys.conversations });
  });

  const send = async (text: string, attachmentIds: string[]) => {
    setBusy(true);
    // every message carries the screen the user looks at (FTR.HMR.CMN-0006 R6)
    const context = chat.subject ? { type: chat.subject.type, key: chat.subject.key, area: chat.area ?? undefined } : undefined;
    try {
      if (issueKey) {
        // the server adds the context of the issue and creates the topic with the first message
        const res = await api.post<{ conversationId: string; message: NabuMessage }>(`/api/v1/issues/${issueKey}/topic/messages`, { text, attachmentIds });
        if (res.message) put({ ...res.message, conversationId: res.conversationId });
        if (res.conversationId !== convId) {
          qc.setQueryData<IssueTopic>(keys.topic(issueKey), (old) => ({ title: old?.title ?? "", conversationId: res.conversationId }));
          qc.invalidateQueries({ queryKey: nabuKeys.conversations });
        }
        return;
      }
      const res = await api.post<{ messageId: string; message: NabuMessage }>(`/api/v1/chat/conversations/${convId}/messages`, { text, attachmentIds, context });
      put(res.message);
    } catch (e) {
      setBusy(false);
      fail(e);
      throw e;
    }
  };

  // Sending is a reaction to a command from another screen, so it lives in
  // an effect and runs once per queued message.
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    const out = chat.takeOutbox();
    if (out && !busy) void send(out, []).catch(() => undefined); // oxlint-disable-line react/set-state-in-effect
  }, [chat.outbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => raw.map((m) => toNabuChatMessage(t, m, wait)), [raw, wait, t]);

  return {
    messages, busy,
    loading: history.isLoading,
    historyError: history.error ? errorText(t, history.error) : undefined,
    hasOlder: history.hasNextPage,
    loadingOlder: history.isFetchingNextPage,
    upload: { maxBytes: config.uploadMaxBytes, accept: config.uploadAllowedTypes.join(",") },
    onLoadOlder: () => void history.fetchNextPage(),
    onSend: (text, attachmentIds) => send(text, attachmentIds),
    async onRetry(messageId) {
      if (busy) return;
      setBusy(true);
      try {
        await api.post(`/api/v1/chat/messages/${messageId}/retry`);
      } catch (e) {
        setBusy(false);
        fail(e);
      }
    },
    async onUpload(file) {
      const form = new FormData();
      form.append("file", file);
      try {
        const a = await api.upload<{ attachmentId: string }>("/api/v1/chat/attachments", form);
        return { id: a.attachmentId, fileName: file.name };
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
