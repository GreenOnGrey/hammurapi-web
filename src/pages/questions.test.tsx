import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DiscoveryQuestion, DiscoveryRequest, DiscoveryView } from "../api/types";
import { keys } from "../api/queries";
import { createI18n } from "../lib/i18n";
import { RevisionTaskCard } from "../chat/discoveryCards";
import { revisionRequests } from "./Issue";
import { QuestionsBlock, answersBody, dropOldDrafts, hasQuestionsSection, linkQuestions, loadDraft } from "./IssueQuestions";

const qs: DiscoveryQuestion[] = [
  { id: "Q5", round: 2, title: "Источник метрики", body: "Где считать?", options: ["VictoriaMetrics", "ClickHouse"], recommended: "VictoriaMetrics", why: "Сразу" },
  { id: "Q6", round: 2, title: "Промокоды", body: "", options: [], recommended: "Не суммируются", why: "" },
  { id: "Q7", round: 2, title: "Подсказка", body: "", options: [], recommended: "Да", why: "" },
];
const doc = (d: Partial<DiscoveryView>): DiscoveryView =>
  ({ content: "## Проблема", revision: 4, complete: true, missing: [], workflow: null, questions: qs, questionRound: 2, ...d });

function render(node: React.ReactNode, qc = new QueryClient()): string {
  return renderToString(
    <I18nextProvider i18n={createI18n("en")}>
      <QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>
    </I18nextProvider>,
  ).replaceAll("<!-- -->", ""); // the markers between text nodes
}

// FTR.HMR.DISC-0001 R26–R28 in the web.
describe("FTR.HMR.DISC-0001: open questions", () => {
  it("QS-06: the body of the answers takes ready choices only", () => {
    const body = answersBody({ answers: {
      Q5: { choice: "option", option: 1 }, Q6: { choice: "own", text: "  Только без промокодов " }, Q7: { choice: "own", text: " " },
      Q9: { choice: "recommended" },
    } }, qs);
    expect(body).toEqual({ answers: [
      { questionId: "Q5", choice: "option", option: 1 },
      { questionId: "Q6", choice: "own", text: "Только без промокодов" },
    ] });
  });

  it("QS-12: without the storage of the browser the draft starts empty", () => {
    expect(loadDraft("ISS.FMS-0007", 4)).toEqual({ answers: {} });
    expect(() => dropOldDrafts("ISS.FMS-0007", 4)).not.toThrow();
  });

  it("QS-14: an assumption leads to its open question only", () => {
    expect(linkQuestions("VictoriaMetrics (допущение, см. Q5); порог (см. Q2); see Q6", ["Q5", "Q6"]))
      .toBe("VictoriaMetrics (допущение, см. [Q5](#q-Q5)); порог (см. Q2); see [Q6](#q-Q6)");
  });

  it("QS-11: an expert gets the choices, the counter and the button", () => {
    const html = render(<QuestionsBlock issueKey="ISS.FMS-0007" d={doc({})} canAnswer />);
    for (const s of ["Open questions", "round 2", "Accept the recommendation", "ClickHouse", "Own answer", "Answered 0 of 3", "Send answers", 'id="q-Q5"']) {
      expect(html).toContain(s);
    }
    // the recommended option is the button «Accept», not a second chip
    expect(html).not.toMatch(/<button[^>]*>VictoriaMetrics</);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Send answers/);
  });

  it("QS-13: others see the questions without the choices", () => {
    const html = render(<QuestionsBlock issueKey="ISS.FMS-0007" d={doc({})} canAnswer={false} />);
    expect(html).toContain("Источник метрики");
    expect(html).toContain("Options: VictoriaMetrics · ClickHouse");
    expect(html).not.toContain("Send answers");
    expect(html).not.toContain("Accept the recommendation");
  });

  it("R24, R26: no questions — «No questions»; the old section in the text — no block", () => {
    expect(render(<QuestionsBlock issueKey="ISS.FMS-0007" d={doc({ questions: [] })} canAnswer />)).toContain("No questions");
    const old = doc({ questions: [], content: "## Проблема\n\n## Открытые вопросы\n\n- в" });
    expect(hasQuestionsSection(old.content)).toBe(true);
    // the languages the core knows (cycledata.openQuestionsRe)
    for (const h of ["## Offene Fragen", "### 4. Preguntas abiertas:", "## 开放问题"]) expect(hasQuestionsSection(`x\n${h}\n- q`)).toBe(true);
    expect(hasQuestionsSection("## Проблема\n\nоткрытые вопросы есть")).toBe(false);
    expect(render(<QuestionsBlock issueKey="ISS.FMS-0007" d={old} canAnswer />)).toBe("");
  });

  it("design §3.5: the history names the instruction and the answered questions together", () => {
    const t = createI18n("ru").t;
    expect(revisionRequests(t, [{ id: "1", author: "А. Петров", instructions: "Учесть праздники", questions: ["Q1", "Q2"] },
      { id: "2", author: "Б. Иванова", instructions: "", questions: ["Q3"] }]))
      .toBe("Поручение: «Учесть праздники» · Ответы: Q1, Q2, Q3 · А. Петров, Б. Иванова");
    expect(revisionRequests(t, [{ id: "1", author: "А. Петров", instructions: "Учесть праздники" }])).toBe("Поручение: «Учесть праздники» · А. Петров");
  });

  it("design §3.3: a long context folds with the instruction", () => {
    const qc = new QueryClient();
    const r: DiscoveryRequest = { id: "r2", issueKey: "ISS.FMS-0007", author: "Анна", instructions: "x", state: "queued", position: 1, revision: null,
      error: null, createdAt: "2026-10-28T10:00:00Z", finishedAt: null, context: Array.from({ length: 8 }, (_, i) => `строка ${i}`).join("\n"), answers: [] };
    qc.setQueryData(keys.discoveryRequest("r2"), r);
    const html = render(<RevisionTaskCard requestId="r2" />, qc);
    expect(html.match(/class="tx clamp"/g)).toHaveLength(2);
    expect(html).toContain("Show in full");
  });

  it("QS-17: the card of a brief shows the answers with where they come from and the context", () => {
    const qc = new QueryClient();
    const r: DiscoveryRequest = { id: "r1", issueKey: "ISS.FMS-0007", author: "Анна", instructions: "", state: "running", position: null, revision: null,
      error: null, createdAt: "2026-10-28T10:00:00Z", finishedAt: null, context: "Команда FMS считает метрики в VictoriaMetrics",
      answers: [{ questionId: "Q5", question: "Источник метрики", answer: "VictoriaMetrics", source: "memory" },
        { questionId: "Q6", question: "Промокоды", answer: "Не суммируются", source: "user" }] };
    qc.setQueryData(keys.discoveryRequest("r1"), r);
    const html = render(<RevisionTaskCard requestId="r1" />, qc);
    for (const s of ["Answers", "from memory · confirmed", "expert", "Context", "Команда FMS", "Running"]) {
      expect(html).toContain(s);
    }
    expect(html).not.toContain("Also");
  });
});
