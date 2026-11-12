import { describe, expect, it } from "vitest";
import type { RunLogEntry } from "../api/types";
import { appendDelta, atBottom, costDetail, filterLog, mergeEntry, money, tokensFull, tokensShort, toolLine } from "./cost";

// FTR.HMR.DEV-0004 qa COST-14: money and tokens in the locale of the interface.
describe("COST-14 money and tokens", () => {
  it("formats dollars with two digits and a floor of a cent", () => {
    expect(money(4.1, "en")).toBe("$4.10");
    expect(money(0.004, "en")).toBe("< $0.01");
    expect(money(0, "en")).toBe("$0.00");
    expect(money(41.2, "ru")).toBe("$41,20");
    expect(money(0.004, "ru")).toBe("< $0,01");
  });
  it("shortens and spells tokens", () => {
    expect(tokensShort(72854239, "en")).toBe("72.9M");
    expect(tokensShort(72854239, "ru")).toMatch(/72,9/);
    expect(tokensFull(72854239, "en")).toBe("72,854,239");
  });
  it("names an item of the cost", () => {
    expect(costDetail("area", "tech")).toBe("area:tech");
    expect(costDetail("checks", null)).toBe("checks");
  });
});

// LOG-02, LOG-13, LOG-14, LOG-16: the entries of the log.
describe("the log of a run", () => {
  const call: RunLogEntry = { id: "tc1", kind: "tool", tool: "bash", command: "go test ./...", at: "2026-11-11T06:52:14Z", result: null };
  it("LOG-02 puts the result of a tool into the entry of its call", () => {
    const list = mergeEntry([call], { id: "tc1", kind: "tool", tool: "bash", isError: true, result: "exit 1" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ command: "go test ./...", result: "exit 1", isError: true, at: call.at });
  });
  it("appends a delta to its message", () => {
    const list = appendDelta([{ id: "m1", kind: "message", text: "Читаю " }], "m1", "код");
    expect(list[0].text).toBe("Читаю код");
  });
  it("LOG-16 filters commands and messages", () => {
    const all: RunLogEntry[] = [{ id: "m1", kind: "message" }, call, { id: "c5", kind: "check" }, { id: "s1", kind: "step" }];
    expect(filterLog(all, "commands").map((e) => e.id)).toEqual(["tc1", "c5"]);
    expect(filterLog(all, "messages").map((e) => e.id)).toEqual(["m1"]);
    expect(filterLog(all, "all")).toHaveLength(4);
  });
  it("LOG-13, LOG-14 keeps to the bottom only at the bottom", () => {
    expect(atBottom({ scrollTop: 980, clientHeight: 400, scrollHeight: 1400 })).toBe(true);
    expect(atBottom({ scrollTop: 600, clientHeight: 400, scrollHeight: 1400 })).toBe(false);
  });
  it("shows a command or a tool with its arguments", () => {
    expect(toolLine(call)).toBe("$ go test ./...");
    expect(toolLine({ id: "t2", kind: "tool", tool: "spec_read", args: { area: "qa" } })).toBe('spec_read {"area":"qa"}');
  });
});
