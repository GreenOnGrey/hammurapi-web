import { describe, expect, it } from "vitest";
import { scenarioWarning } from "./Nabu";

// FTR.HMR.CMN-0007 R4, R14, design §3.6: the warnings of the binding come from the rows of the core.
describe("the warning of a scenario row", () => {
  const agents = [
    { name: "coder", description: "", workspace: "nabu" },
    { name: "plain", description: "", workspace: "none" },
  ];
  it("warns about an unbound scenario", () => {
    expect(scenarioWarning({ name: "issue_analysis", code: false }, undefined, agents)).toBe("unbound");
  });
  it("warns only when a code scenario has an agent without the sandbox of Nabu", () => {
    expect(scenarioWarning({ name: "codegen", code: true }, "plain", agents)).toBe("noSandbox");
    expect(scenarioWarning({ name: "codegen", code: true }, "coder", agents)).toBeNull();
    expect(scenarioWarning({ name: "issue_analysis", code: false }, "plain", agents)).toBeNull();
  });
});
