// FTR.HMR.DEV-0004 R4–R11, design §1, §3: the money and tokens of the cost of a feature and the entries of the
// log of a run — pure functions the components share and the tests check.
import type { RunLogEntry } from "../api/types";

/** Dollars with two digits in the locale of the interface, the sign first in every one: «$4,12», «$4.12»;
 * below a cent — «< $0,01» (design §1). */
export function money(v: number, lng: string): string {
  const f = new Intl.NumberFormat(lng, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0 && v < 0.01) return "< $" + f.format(0.01);
  return "$" + f.format(v);
}

/** Tokens in short: «72,9 млн», «72.9M»; whole numbers below a thousand. */
export function tokensShort(n: number, lng: string): string {
  return new Intl.NumberFormat(lng, { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(n));
}

/** Tokens in full with the separators of the locale. */
export function tokensFull(n: number, lng: string): string {
  return new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** The sum of the tokens of every kind. */
export function tokensTotal(t: { in: number; out: number; cacheRead: number; cacheWrite: number }): number {
  return t.in + t.out + t.cacheRead + t.cacheWrite;
}

/** The item of the cost of a gate or a service, as the API names it in ?detail=. */
export function costDetail(kind: string, key: string | null): string {
  return key ? `${kind}:${key}` : kind;
}

/** The name of an item of the cost by the stage of the feature: research, specification, the changes of a service,
 * the check (FTR.HMR.DEV-0004 R7). withAreas: the feature has items of gates too. */
export function costItemLabel(t: (k: string, o?: Record<string, unknown>) => string, s: { kind: string; key: string | null }, withAreas = false): string {
  if (s.kind === "area") return t("cost.item.area", { area: t(`areas.${s.key}`) });
  // next to the gates the runs of the writer before the attribution are told apart from them
  if (s.kind === "legacy" && withAreas) return t("cost.item.legacyBeside");
  if (s.kind === "service") return t("cost.item.service", { service: s.key });
  return t(`cost.item.${s.kind}`);
}

/** Puts an entry of the log in its place: a new one at the end, one with a known id in place of the old (R8). */
export function mergeEntry(list: RunLogEntry[], e: RunLogEntry): RunLogEntry[] {
  const i = list.findIndex((x) => x.id === e.id);
  if (i < 0) return [...list, e];
  const next = list.slice();
  next[i] = { ...list[i], ...e, at: list[i].at ?? e.at, command: e.command ?? list[i].command, args: e.args ?? list[i].args };
  return next;
}

/** Adds the text of a delta to its open message. */
export function appendDelta(list: RunLogEntry[], id: string, text: string): RunLogEntry[] {
  return list.map((x) => (x.id === id ? { ...x, text: (x.text ?? "") + text } : x));
}

export type LogFilter = "all" | "commands" | "messages";

/** The filter of the log (design §3.4): commands — tools and checks, messages — the text of the agent. */
export function filterLog(list: RunLogEntry[], f: LogFilter): RunLogEntry[] {
  if (f === "commands") return list.filter((e) => e.kind === "tool" || e.kind === "check");
  if (f === "messages") return list.filter((e) => e.kind === "message");
  return list;
}

/** The log keeps to the bottom while the reader is there (R9): 24 px of slack. */
export function atBottom(el: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
}

/** The arguments of a tool: an object, or a string when they are not JSON. Nabu may pass them as the text of
 * JSON (after masking); read once more, or `JSON.stringify` would escape it twice — «\\n» in the log. */
export function argsOf(e: RunLogEntry): Record<string, unknown> | string | undefined {
  let a: unknown = e.args;
  if (typeof e.args === "string") {
    try {
      a = JSON.parse(e.args);
    } catch {
      return e.args;
    }
  }
  if (a === undefined || a === null) return undefined;
  return typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : JSON.stringify(a);
}

/** A value in one line (design §3.4): up to the first line break and 80 characters. */
function brief(v: unknown): string {
  const s = text(v);
  const line = s.split("\n")[0];
  return line.length > 80 ? line.slice(0, 80) + "…" : line === s ? line : line + " …";
}

/** The shell command of a tool, or its name with the arguments in one line. */
export function toolLine(e: RunLogEntry): string {
  if (e.command) return "$ " + e.command;
  const a = argsOf(e);
  const args = a === undefined ? "" : typeof a === "string" ? brief(a) : Object.entries(a).map(([k, v]) => `${k}=${brief(v)}`).join(" ");
  return (e.tool ?? "") + (args ? " " + args : "");
}

/** A value as text: a string as it is, anything else as JSON; `undefined` — nothing. */
function text(v: unknown, space?: number): string {
  return typeof v === "string" ? v : (JSON.stringify(v, null, space) ?? "");
}

/** The arguments of a tool by field, a text value as it is — with its line breaks (design §3.4). */
export function argFields(e: RunLogEntry): [string, string][] {
  if (e.command) return [];
  const a = argsOf(e);
  if (a === undefined) return [];
  if (typeof a === "string") return [["", a]];
  return Object.entries(a).map(([k, v]) => [k, text(v, 2)]);
}

const indent = (s: string, by = "    ") => s.split("\n").map((l) => by + l).join("\n");

/** The log as a text file (R8, design §3.4): every entry whatever the filter, a paragraph each. `time` and `text`
 * come from the panel, so the file says what the panel shows. */
export function logFile(entries: RunLogEntry[], title: string, time: (e: RunLogEntry) => string, text: (e: RunLogEntry) => string): string {
  const out = [title, ""];
  for (const e of entries) {
    const at = time(e);
    const head = at ? at + "  " : "";
    if (e.kind === "tool") {
      const lines = [head + (e.isError ? "✗ " : "") + (e.command ? "$ " + e.command : e.tool ?? "")];
      const fields = argFields(e);
      for (const [k, v] of fields) {
        if (k) lines.push(`  ${k}:`);
        lines.push(indent(v));
      }
      if (e.result != null && e.result !== "") {
        if (fields.length) lines.push("  result:"); // after the arguments the output is told apart
        lines.push(indent(e.result));
      }
      out.push(lines.join("\n"), "");
    } else {
      const s = text(e);
      if (s) out.push(head + s, "");
    }
  }
  return out.join("\n");
}

/** The name of the file of a log: «booking-1a2b3c4d.log». */
export function logFileName(subject: string, runId: string): string {
  const safe = subject.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "run";
  return `${safe}-${runId.replace(/-/g, "").slice(0, 8)}.log`;
}
