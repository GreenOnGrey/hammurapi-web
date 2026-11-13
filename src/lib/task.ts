// The texts of a code task that the core gives in English: the warnings of its result and the output of its check.

type T = (k: string, o?: Record<string, unknown>) => string;

/** The warnings of the result of a task (FTR.HMR.CMN-0008 R17, R20, FTR.HMR.DEV-0004 R16), by the English text of the
 * core; an unknown one is shown as it came. */
const WARNINGS: { prefix: string; key: string; files?: boolean }[] = [
  { prefix: "The agent changed existing tests or CI files: ", key: "task.warning.protected", files: true },
  { prefix: "The agent changed the dependencies, the PR needs a review by a person: ", key: "task.warning.dependencies", files: true },
  { prefix: "The agent was stopped: it kept repeating the same action with no result.", key: "task.warning.stalled" },
];

export function warningText(t: T, w: string): string {
  for (const x of WARNINGS) {
    if (x.files ? w.startsWith(x.prefix) : w === x.prefix) return t(x.key, { files: w.slice(x.prefix.length) });
  }
  return w;
}

// eslint-disable-next-line no-control-regex
const ANSI = /(?:\u001b|\ufffd)\[[0-9;?]*[ -/]*[@-~]/g;

/** The output of a check without the colours of the terminal: escape sequences, and the bytes they lost on the way. */
export function plainOutput(s: string): string {
  return s.replace(ANSI, "").replace(/\ufffd/g, "");
}
