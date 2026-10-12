import { describe, expect, it } from "vitest";
import type { ChatMessage, NabuMessage } from "../api/types";
import { createI18n } from "../lib/i18n";
import { nabuMark, nabuStepText, toNabuChatMessage, toNabuConversation } from "./nabuAdapter";
import { answerOf, askedBy, ownMark, toOwnMessages, type Live } from "./ownAdapter";

const t = createI18n("en").t;

const nabu = (m: Partial<NabuMessage>): NabuMessage => ({
  id: "n1", conversationId: "main", role: "user", text: "Hi", channel: "client:hammurapi", status: "done",
  attachments: [], toolSteps: [], context: null, errorClass: null, errorText: null, createdAt: "2026-10-11T14:00:00Z", ...m,
});
const own = (m: Partial<ChatMessage>): ChatMessage => ({
  id: "u1", role: "user", mode: "general", context: null, content: "Hi", isVoice: false, attachments: [], createdAt: "2026-10-11T14:00:00Z", ...m,
});

// FTR.NAB.CMN-0005 qa CHAT-22: the window to the agent of Nabu.
describe("the adapter of the agent of Nabu (CHAT-22)", () => {
  it("marks a message with the specification it is about, a plain one has no mark", () => {
    expect(nabuMark(t, nabu({ context: { type: "feature", key: "FTR.NAB.CMN-0005" } }))).toEqual({ icon: "files", text: "Specification, FTR.NAB.CMN-0005" });
    expect(nabuMark(t, nabu({}))).toBeUndefined();
    expect(nabuMark(t, nabu({ channel: "web" }))).toBeUndefined();
  });

  it("marks a message that came from another channel", () => {
    expect(nabuMark(t, nabu({ channel: "telegram" }))?.icon).toBe("tg");
    expect(nabuMark(t, nabu({ channel: "email" }))?.icon).toBe("mail");
  });

  it("turns tool steps, the waiting state and an error into the types of the kit", () => {
    const step = { id: "s1", server: "hammurapi", tool: "spec_read", summary: "spec_read — FTR.X", status: "done" as const };
    expect(nabuStepText(step)).toBe("hammurapi: FTR.X");
    expect(nabuStepText({ ...step, server: "", summary: "plain" })).toBe("spec_read");
    const a = toNabuChatMessage(t, nabu({ id: "a", role: "assistant", toolSteps: [step], status: "failed", errorClass: "rate_limit" }), null);
    expect(a.steps).toEqual([{ id: "s1", text: "hammurapi: FTR.X", title: "spec_read — FTR.X", status: "done" }]);
    expect(a.error?.transient).toBe(true);
    const wait = { conversationId: "main", messageId: "n1", state: "queued" as const, position: 2 };
    expect(toNabuChatMessage(t, nabu({}), wait).wait).toEqual({ state: "queued", position: 2 });
    expect(toNabuChatMessage(t, nabu({ id: "other" }), wait).wait).toBeUndefined();
  });

  it("lists the main conversation under the id the API resolves", () => {
    const c = { id: "c-17", kind: "main" as const, title: null, lastMessageAt: null, archivedAt: null, createdAt: "2026-10-01T09:00:00Z" };
    expect(toNabuConversation(t, c, "en")).toMatchObject({ id: "main", group: "main" });
    expect(toNabuConversation(t, { ...c, kind: "topic", title: "Release", archivedAt: "2026-10-03T09:00:00Z" }, "en")).toMatchObject({ id: "c-17", group: "archive", title: "Release" });
  });
});

// FTR.NAB.CMN-0005 qa CHAT-23: the built-in chat.
describe("the adapter of the built-in chat (CHAT-23)", () => {
  it("marks a question about a specification and a voice message", () => {
    expect(ownMark(t, own({}))).toBeUndefined();
    expect(ownMark(t, own({ isVoice: true }))).toEqual({ icon: "mic", text: "voice" });
    const spec = ownMark(t, own({ mode: "spec", isVoice: true, context: { type: "feature", key: "FTR.X", area: null } }));
    expect(spec).toEqual({ icon: "files", text: "Specification, FTR.X · voice" });
  });

  it("draws the answer being written under the message it answers", () => {
    const live: Live = { messageId: "u1", text: "", tools: [{ id: "t1", title: "edit_spec", status: "running" }], done: false };
    const out = toOwnMessages(t, [own({})], live);
    expect(out.map((m) => m.id)).toEqual(["u1", answerOf("u1")]);
    expect(out[1]).toMatchObject({ role: "assistant", status: "pending", steps: [{ id: "t1", status: "running" }] });
    expect(toOwnMessages(t, [own({})], { ...live, text: "So" })[1]).toMatchObject({ status: "streaming", text: "So" });
  });

  it("draws an LLM error as the failed answer, with the message to retry", () => {
    const out = toOwnMessages(t, [own({ errorClass: "rate_limit" })], null);
    expect(out[1]).toMatchObject({ id: answerOf("u1"), status: "failed", error: { transient: true } });
    expect(askedBy(out[1].id)).toBe("u1");
    expect(askedBy("u1")).toBe("u1");
  });

  it("hides the error of a message that was retried", () => {
    const out = toOwnMessages(t, [own({ errorClass: "rate_limit" }), own({ id: "u2", retryOf: "u1" })], null);
    expect(out.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("keeps the order of the history and turns agent messages into answers", () => {
    const out = toOwnMessages(t, [own({}), own({ id: "a1", role: "agent", content: "Done" })], null);
    expect(out[1]).toMatchObject({ id: "a1", role: "assistant", text: "Done", status: "done" });
  });
});
