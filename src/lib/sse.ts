import { apiUrl } from "../api/base";
import { useEffect, useLayoutEffect, useRef } from "react";

// One SSE stream carries every event type (tech spec, API §9).
export type EventType =
  | "agent.token" | "agent.tool_call" | "agent.done" | "agent.error"
  | "gate.updated" | "feature.deleted"
  | "issue.updated" | "discovery.progress" | "feature.updated" | "task.progress" | "validation.updated"
  | "release.updated" | "release.blocked" | "focus.changed" | "spec.index_updated"
  | "approvals.changed" | "import.progress"
  | "chat.error" | "chat.model" | "agent.connection_status"
  // FTR.HMR.CMN-0006: the stream of the personal agent in Nabu, relayed by api.
  | "nabu.message.created" | "nabu.message.delta" | "nabu.message.done" | "nabu.tool.step"
  | "nabu.conversation.updated" | "nabu.agent.updated" | "nabu.connected" | "nabu.disconnected"
  // FTR.NAB.CMN-0004: a turn waits for the pod of the agent
  | "nabu.agent.state";

const TYPES: EventType[] = [
  "agent.token", "agent.tool_call", "agent.done", "agent.error",
  "gate.updated", "feature.deleted", "approvals.changed", "import.progress",
  "issue.updated", "discovery.progress", "feature.updated", "task.progress", "validation.updated",
  "release.updated", "release.blocked", "focus.changed", "spec.index_updated",
  "chat.error", "chat.model", "agent.connection_status",
  "nabu.message.created", "nabu.message.delta", "nabu.message.done", "nabu.tool.step",
  "nabu.conversation.updated", "nabu.agent.updated", "nabu.connected", "nabu.disconnected",
  "nabu.agent.state",
];

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<EventType, Set<Handler>>();
let source: EventSource | null = null;
const reconnectHandlers = new Set<() => void>();

export function connectEvents() {
  if (source) return;
  source = new EventSource(apiUrl("/api/v1/events"), { withCredentials: true });
  let wasOpen = false;
  source.addEventListener("open", () => {
    // After a reconnect, state may have changed while we were away.
    if (wasOpen) reconnectHandlers.forEach((h) => h());
    wasOpen = true;
  });
  for (const type of TYPES) {
    source.addEventListener(type, (e) => {
      let data: unknown;
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch {
        return;
      }
      handlers.get(type)?.forEach((h) => h(data));
    });
  }
}

export function disconnectEvents() {
  source?.close();
  source = null;
}

export function onEvent(type: EventType, h: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(h);
  return () => handlers.get(type)!.delete(h);
}

export function onReconnect(h: () => void): () => void {
  reconnectHandlers.add(h);
  return () => reconnectHandlers.delete(h);
}

/** Subscribes to an event type for the component's lifetime; the latest handler is always used. */
export function useEvent(type: EventType, h: Handler) {
  const ref = useRef(h);
  useLayoutEffect(() => {
    ref.current = h;
  });
  useEffect(() => onEvent(type, (d) => ref.current(d)), [type]);
}
