import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keys } from "../api/queries";
import { createI18n } from "../lib/i18n";
import { SpecQuestions } from "./feature/SpecQuestions";
import { allStagesPassed, GATE_ICONS, reachedStage, STAGES } from "./Feature";
import { specTopicSuggestions } from "../chat/NabuChat";
import { specNotice, specRequestId } from "../chat/specCards";
import { AREAS } from "../api/types";

// FTR.HMR.DEV-0001 qa: UI-01, UI-02, UI-04, TP-04.
describe("the stages of a feature", () => {
  it("UI-01: three stages, release is not one of them", () => {
    expect(STAGES.map((s) => s.tab)).toEqual(["spec", "implementation", "validation"]);
  });
  it("UI-04: the reached stage bounds the links", () => {
    expect(reachedStage({ phase: "spec" })).toBe(0);
    expect(reachedStage({ phase: "codegen" })).toBe(1);
    expect(reachedStage({ phase: "validation" })).toBe(2);
    expect(reachedStage({ phase: "released" })).toBe(2);
  });
  it("UI-02: every stage is passed after validation", () => {
    for (const phase of ["in_release", "released", "rolled_back"] as const) expect(allStagesPassed({ phase })).toBe(true);
    expect(allStagesPassed({ phase: "validation" })).toBe(false);
  });
  it("every gate has an icon", () => {
    for (const a of AREAS) expect(GATE_ICONS[a]).toBeTruthy();
  });
});

describe("the draft of the topic of a feature", () => {
  it("TP-04: the suggestions by the gate and the role", () => {
    expect(specTopicSuggestions("product", "questions", true)).toEqual(["answer", "explain", "why"]);
    expect(specTopicSuggestions("product", "questions", false)).toEqual(["explain", "why"]);
    expect(specTopicSuggestions("arch", "written", true)).toEqual(["addTo", "changeEarlier", "why"]);
    expect(specTopicSuggestions("tech", "written", true)).toEqual(["changeThis", "coverage", "why"]);
    expect(specTopicSuggestions("design", "later", true)).toEqual(["whatIn"]);
    expect(specTopicSuggestions("design", "skipped", true)).toEqual(["whatIn", "restore"]);
    expect(specTopicSuggestions("design", "skipped", false)).toEqual(["whatIn"]);
  });
});

describe("the cards of the writer", () => {
  const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("the instruction comes from the step of the tool", () => {
    const steps = [{ id: "1", tool: "hammurapi: request_spec_revision", status: "done", summary: `{"requestId":"${ID}","state":"queued"}` }];
    expect(specRequestId({ toolSteps: steps as never })).toBe(ID);
    expect(specRequestId({ toolSteps: [{ ...steps[0], tool: "request_discovery_revision" }] as never })).toBeUndefined();
  });
  it("a notice of the writer is told from others", () => {
    expect(specNotice({ role: "notice", payload: { kind: "spec.conflict" } } as never)?.kind).toBe("spec.conflict");
    expect(specNotice({ role: "notice", payload: { kind: "discovery.revision" } } as never)).toBeUndefined();
    expect(specNotice({ role: "assistant", payload: { kind: "spec.revision" } } as never)).toBeUndefined();
  });
});

// FTR.HMR.DEV-0001 RT-04: the permission to change another gate is a decision of its own, off by default.
describe("the questions of the writer", () => {
  const question = { id: "Q2", round: 1, title: "Аудит", body: "", options: [], recommended: "Да", why: "", audience: "product" as const, forOthers: true, touches: ["product" as const] };
  const render = (canAnswer: boolean) => {
    const qc = new QueryClient();
    qc.setQueryData(keys.specQuestions("FTR.FMS.CAR-0005"), { items: [{ area: "arch", round: 1, roundsLeft: 4, questions: [{ ...question, canAnswer }] }] });
    return renderToString(
      <I18nextProvider i18n={createI18n("en")}>
        <QueryClientProvider client={qc}><SpecQuestions featureKey="FTR.FMS.CAR-0005" area="arch" /></QueryClientProvider>
      </I18nextProvider>,
    );
  };
  it("who answers sees an unchecked permission", () => {
    const html = render(true);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked=");
    expect(html).toContain("for product experts");
  });
  it("others see what the answer may change", () => {
    const html = render(false);
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Product experts answer");
  });
});
