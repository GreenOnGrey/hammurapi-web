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

/** The shell command of a tool or its name with the arguments in one line. */
export function toolLine(e: RunLogEntry): string {
  if (e.command) return "$ " + e.command;
  const args = e.args === undefined ? "" : " " + JSON.stringify(e.args);
  return (e.tool ?? "") + args;
}
