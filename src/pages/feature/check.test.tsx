import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../lib/i18n";
import { CheckBadge } from "./Implementation";
import type { TaskCheck } from "../../api/types";

const base: TaskCheck = { status: "passed", command: "npm test", attempts: 2, maxAttempts: 3, outputTail: "FAIL a" };
const html = (check: TaskCheck) => renderToString(<I18nextProvider i18n={createI18n("en")}><CheckBadge check={check} /></I18nextProvider>);

// FTR.HMR.CMN-0008 CHK-38: the states of the check of a task.
describe("CheckBadge", () => {
  it.each([
    ["passed", "Check passed", "approved"],
    ["failed", "Check failed", "blocked"],
    ["unavailable", "Could not check", "disc"],
  ] as const)("%s: the state, the command, the attempts and the output", (status, label, tone) => {
    const out = html({ ...base, status });
    for (const want of [label, `st ${tone}`, "npm test", "FAIL a"]) expect(out).toContain(want);
    expect(out).toMatch(/2.*of.*3 attempts/);
  });

  it("unverified: only the state", () => {
    const out = html({ ...base, status: "unverified", command: "" });
    expect(out).toContain("Not checked");
    expect(out).not.toContain("FAIL a");
  });

  it("not_run: nothing when the working copy did not change", () => {
    expect(html({ ...base, status: "not_run" })).toBe("");
  });
});
