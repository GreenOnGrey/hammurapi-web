import { describe, expect, it } from "vitest";
import type { NabuMessage } from "../api/types";
import { createI18n } from "../lib/i18n";
import { estimateLine } from "../pages/IssueEstimate";
import { discoveryNotice, revisionRequestId } from "./discoveryCards";
import { topicSuggestions } from "./NabuChat";
import { toNabuChatMessage } from "./nabuAdapter";

const en = createI18n("en").t;
const ru = createI18n("ru").t;
const ID = "0f6c2a3e-7d1b-4a55-9c1e-2b3d4e5f6a7b";

const nabu = (m: Partial<NabuMessage>): NabuMessage => ({
  id: "n1", conversationId: "c1", role: "assistant", text: "Передал исследователю.", channel: "client:hammurapi", status: "done",
  attachments: [], toolSteps: [], context: null, errorClass: null, errorText: null, createdAt: "2026-10-21T14:02:00Z", ...m,
});

// FTR.HMR.DISC-0001 in the web.
describe("FTR.HMR.DISC-0001: the topic of an issue", () => {
  it("TP-04: the suggestions of the draft follow the status and the role", () => {
    expect(topicSuggestions("new", true)).toEqual(["known", "similar"]);
    expect(topicSuggestions("discovery", false)).toEqual(["known"]);
    expect(topicSuggestions("verification", true)).toEqual(["metric", "estimate", "duplicates"]);
    expect(topicSuggestions("verification", false)).toEqual(["value", "duplicates"]);
    expect(topicSuggestions("accepted", true)).toEqual(["why", "where"]);
    expect(topicSuggestions("rejected", false)).toEqual(["why", "where"]);
  });

  it("NT-10: the answer with an instruction draws its card; the id comes from the result of the step", () => {
    const step = { id: "s1", server: "hammurapi", tool: "request_discovery_revision", status: "done" as const,
      summary: `hammurapi: request_discovery_revision — {"requestId":"${ID}","state":"queued","position":1,"issueKey":"ISS.FMS-0007"}` };
    const m = nabu({ toolSteps: [step] });
    expect(revisionRequestId(m)).toBe(ID);
    expect(toNabuChatMessage(en, m, null).content).toBeTruthy();
    // a running step or another tool draws no card
    expect(revisionRequestId(nabu({ toolSteps: [{ ...step, status: "running" }] }))).toBeUndefined();
    expect(toNabuChatMessage(en, nabu({}), null).content).toBeUndefined();
  });

  it("NT-01: a notice of Hammurapi is the card of the result, not words of the agent", () => {
    const m = nabu({ role: "notice", text: "**Анализ обновлён · ревизия 4**", clientName: "hammurapi",
      payload: { kind: "discovery.revision", issueKey: "ISS.FMS-0007", revision: 4, requestIds: [ID], coAuthors: [] } });
    expect(discoveryNotice(m)?.revision).toBe(4);
    const out = toNabuChatMessage(en, m, null);
    expect(out.role).toBe("assistant");
    expect(out.variant).toBe("notice"); // drawn by the kit as a notice (ui-kit 1.9)
    expect(out.mark).toEqual({ icon: "plug", text: "Hammurapi" });
    expect(out.content).toBeTruthy();
    const other = nabu({ role: "notice", payload: { kind: "other" } });
    expect(discoveryNotice(other)).toBeUndefined();
    expect(toNabuChatMessage(en, other, null)).toMatchObject({ variant: "notice", content: undefined });
  });
});

describe("FTR.HMR.DISC-0001: the draft estimate", () => {
  it("ES-10: the summary line names the cost, the person-hours and the days", () => {
    const e = { agentUsd: 40.4, personHours: 12, days: 9, confidence: "medium" as const };
    expect(estimateLine(ru, e, "ru")).toBe("≈ $40 агента · 12 чел/ч · 9 дней");
    expect(estimateLine(en, { ...e, days: 1 }, "en")).toBe("≈ $40 of agents · 12 person-hours · 1 day");
  });
});
