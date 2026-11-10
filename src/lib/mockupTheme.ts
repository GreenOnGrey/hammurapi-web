import { useSyncExternalStore } from "react";

export type MockupTheme = "light" | "dark";

const KEY = "hmr.mockupTheme";
const listeners = new Set<() => void>();
let picked: MockupTheme | null = null;

/** The theme of the application now: the explicit one, or the one of the system. */
function appTheme(): MockupTheme {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "light" || t === "dark") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function current(): MockupTheme {
  if (picked) return picked;
  try {
    const v = sessionStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage is off */
  }
  return appTheme();
}

function set(t: MockupTheme) {
  picked = t;
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    /* storage is off */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The theme of a mockup (FTR.HMR.DEV-0003 R2, design §3.1): the theme of the application
 * until the user picks one; the pick lives for the session of the browser and is common to
 * every mockup — the one on the gate and the one in the viewer change together. */
export function useMockupTheme(): [MockupTheme, (t: MockupTheme) => void] {
  return [useSyncExternalStore(subscribe, current, () => "light" as MockupTheme), set];
}

/** The address of a mockup in a theme: the fragment the mockup reads (rules/design/template.md). */
export function withTheme(href: string, theme: MockupTheme): string {
  return `${href.split("#")[0]}#theme=${theme}`;
}
