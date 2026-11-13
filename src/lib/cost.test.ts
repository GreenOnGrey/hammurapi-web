import { describe, expect, it } from "vitest";
import type { RunLogEntry } from "../api/types";
import { appendDelta, argFields, atBottom, costDetail, costItemLabel, filterLog, logFile, logFileName, mergeEntry, money, tokensFull, tokensShort, toolLine } from "./cost";

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

// COST-22: the items of the cost are named by the stages of the feature.
const keyOf = (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k);
describe("COST-22 the names of the items", () => {
  const t = keyOf;
  it("names a stage, a gate by its area and a service by its key", () => {
    expect(costItemLabel(t, { kind: "research", key: null })).toBe("cost.item.research");
    expect(costItemLabel(t, { kind: "area", key: "tech" })).toBe('cost.item.area{"area":"areas.tech"}');
    expect(costItemLabel(t, { kind: "legacy", key: null })).toBe("cost.item.legacy");
    expect(costItemLabel(t, { kind: "legacy", key: null }, true)).toBe("cost.item.legacyBeside");
    expect(costItemLabel(t, { kind: "service", key: "nabu-core" })).toBe('cost.item.service{"service":"nabu-core"}');
    expect(costItemLabel(t, { kind: "checks", key: null })).toBe("cost.item.checks");
  });
});

// LOG-13, LOG-14, LOG-16: the entries of the log.
describe("the log of a run", () => {
  const call: RunLogEntry = { id: "tc1", kind: "tool", tool: "bash", command: "go test ./...", at: "2026-11-11T06:52:14Z", result: null };
  it("puts the result of a tool into the entry of its call", () => {
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
    expect(toolLine({ id: "t2", kind: "tool", tool: "spec_read", args: { area: "qa" } })).toBe("spec_read area=qa");
  });
  // design §3.4: arguments that come as the text of JSON are read once, a long value is cut in the line
  const write: RunLogEntry = { id: "w", kind: "tool", tool: "write", at: "2026-11-11T07:02:00Z", result: "wrote 2 lines",
    args: JSON.stringify({ path: "m/0019.sql", content: "-- +goose Up\nALTER TABLE r ADD c int;" }) };
  it("LOG-23 reads the arguments of a tool by field, with their line breaks", () => {
    expect(toolLine(write)).toBe("write path=m/0019.sql content=-- +goose Up …");
    expect(argFields(write)).toEqual([["path", "m/0019.sql"], ["content", "-- +goose Up\nALTER TABLE r ADD c int;"]]);
    expect(toolLine({ id: "x", kind: "tool", tool: "t", args: { q: "a".repeat(100) } })).toBe("t q=" + "a".repeat(80) + "…");
  });
  it("LOG-23 writes every entry into the file, whatever the filter", () => {
    const entries: RunLogEntry[] = [{ id: "m1", kind: "message", text: "Читаю код" },
      { ...call, result: "ok\nPASS" }, write, { id: "s1", kind: "step", step: "commit", status: "failed", detail: "HTTP 404" }];
    const text = logFile(entries, "Лог · booking", (e) => (e.at ? "07:02:00" : ""), (e) => (e.kind === "step" ? "Коммит: " + e.detail : e.text ?? ""));
    expect(text).toBe([
      "Лог · booking", "",
      "Читаю код", "",
      "07:02:00  $ go test ./...\n    ok\n    PASS", "",
      "07:02:00  write\n  path:\n    m/0019.sql\n  content:\n    -- +goose Up\n    ALTER TABLE r ADD c int;\n  result:\n    wrote 2 lines", "",
      "Коммит: HTTP 404", "",
    ].join("\n"));
    expect(logFileName("nabu-core", "1a2b3c4d-5e6f-7a8b")).toBe("nabu-core-1a2b3c4d.log");
  });
});
