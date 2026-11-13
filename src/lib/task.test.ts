import { describe, expect, it } from "vitest";
import { plainOutput, warningText } from "./task";

const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k);

// FTR.HMR.DEV-0004 qa WRN-01: the warnings of a task in the language of the interface.
describe("the warnings of a task", () => {
  it("translates the warnings of the core and keeps their files", () => {
    expect(warningText(t, "The agent changed existing tests or CI files: a.test.ts, ci.yml")).toBe('task.warning.protected{"files":"a.test.ts, ci.yml"}');
    expect(warningText(t, "The agent changed the dependencies, the PR needs a review by a person: go.mod")).toBe('task.warning.dependencies{"files":"go.mod"}');
    expect(warningText(t, "The agent was stopped: it kept repeating the same action with no result.")).toBe('task.warning.stalled{"files":""}');
  });
  it("shows an unknown warning as it came", () => {
    expect(warningText(t, "Something new")).toBe("Something new");
  });
});

// FTR.HMR.DEV-0004 qa WRN-02: the end of the output of the check without the colours of the terminal.
describe("the output of a check", () => {
  it("drops escape sequences, also those whose ESC was lost", () => {
    expect(plainOutput("\u001b[32m✓\u001b[39m ok\n\ufffd[2m Tests \ufffd[22m \ufffd[1m\ufffd[32m132 passed")).toBe("✓ ok\n Tests  132 passed");
  });
});
