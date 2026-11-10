import { useSyncExternalStore } from "react";

export type MockupTheme = "light" | "dark";

/** The theme of the application now: the explicit one, or the one of the system. */
function appTheme(): MockupTheme {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "light" || t === "dark") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(l: () => void) {
  const mo = new MutationObserver(l);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener("change", l);
  return () => {
    mo.disconnect();
    mq?.removeEventListener("change", l);
  };
}

/** The theme of a mockup (FTR.HMR.DEV-0003 R2 1.1): the theme of the application. Hammurapi has no switch of
 * its own — a mockup switches its theme itself (rules/design/template.md). */
export function useMockupTheme(): MockupTheme {
  return useSyncExternalStore(subscribe, appTheme, () => "light" as MockupTheme);
}

/** The address of a mockup in a theme: the fragment the mockup reads (rules/design/template.md). */
export function withTheme(href: string, theme: MockupTheme): string {
  return `${href.split("#")[0]}#theme=${theme}`;
}
