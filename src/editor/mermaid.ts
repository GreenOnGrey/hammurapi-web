import type { MockupTheme } from "../lib/mockupTheme";

// FTR.HMR.SPEC-0004 R5, arch §3.3: a mermaid block of a document drawn as a diagram. mermaid and DOMPurify are
// loaded on the first block; securityLevel strict keeps labels text, and the SVG goes through DOMPurify with the
// SVG profile before it reaches the document.

export type Rendered = { svg: string } | { error: string; line?: number };

let seq = 0;
let lastTheme = "";
// mermaid is configured globally: renders go one after another, each with the configuration of its own theme
let queue: Promise<unknown> = Promise.resolve();

type Token = (name: string, fallback: string) => string;

function tokens(): Token {
  const s = getComputedStyle(document.documentElement);
  return (name, fallback) => s.getPropertyValue(name).trim() || fallback;
}

/** The tokens of the theme of the application as the variables of mermaid (design §1). */
function themeVariables(v: Token): Record<string, string> {
  const text = v("--text", "#1c1f23");
  return {
    fontFamily: v("--font", "system-ui, sans-serif"),
    background: v("--bg", "#ffffff"),
    primaryColor: v("--green-soft", "#e3f1e8"),
    primaryBorderColor: v("--green", "#2f7d4f"),
    primaryTextColor: text,
    secondaryColor: v("--surface-2", "#eef0f3"),
    tertiaryColor: v("--surface", "#f6f7f9"),
    lineColor: v("--text-2", "#5f6670"),
    textColor: text,
    // C4: containers of services in the accent, people and external systems neutral
    personBkg: v("--surface-2", "#eef0f3"),
    personBorder: v("--border-strong", "#c9ced5"),
  };
}

/** The line of an error of mermaid: "Parse error on line 4:" or "line 4". */
export function errorLine(msg: string): number | undefined {
  const m = /line (\d+)/i.exec(msg);
  return m ? Number(m[1]) : undefined;
}

/** The colors of the shapes of C4 (design §1): containers of services in the accent, people and external systems
 * neutral. The text of a shape stays white in mermaid, so the fills are strong colors of both themes. */
function c4Colors(v: Token): Record<string, string> {
  const accent = v("--green", "#2f7d4f");
  const neutral = v("--muted", "#6b7280");
  const out: Record<string, string> = {};
  for (const k of ["container", "container_db", "container_queue", "component", "component_db", "component_queue"]) {
    out[`${k}_bg_color`] = accent;
    out[`${k}_border_color`] = accent;
  }
  for (const k of ["person", "external_person", "system", "system_db", "system_queue", "external_system", "external_system_db",
    "external_system_queue", "external_container", "external_container_db", "external_container_queue", "external_component"]) {
    out[`${k}_bg_color`] = neutral;
    out[`${k}_border_color`] = neutral;
  }
  return out;
}

/** The lines, the labels of relations and the boundaries of C4 are drawn by mermaid in fixed greys and black: they
 * take the colors of the text of the theme. Styles, unlike attributes, accept the variables of the page. */
export function recolor(svg: SVGSVGElement) {
  const map: Record<string, string> = { "#444444": "var(--text-2)", black: "var(--text)", "#000000": "var(--text-2)" };
  svg.querySelectorAll<SVGElement>("[fill], [stroke]").forEach((e) => {
    const fill = e.getAttribute("fill");
    const stroke = e.getAttribute("stroke");
    if (fill && map[fill]) e.style.fill = map[fill];
    if (stroke && map[stroke]) e.style.stroke = map[stroke];
  });
  svg.querySelectorAll<SVGElement>("text").forEach((e) => {
    const fill = e.style.fill || e.getAttribute("fill") || "";
    if (fill === "black" || fill === "#444444" || fill === "rgb(68, 68, 68)") e.style.fill = "var(--text-2)";
  });
}

/** The words of an error of mermaid without its position: "Parse error on line 6:\n…\n---^\nExpecting …" is
 * "Expecting …"; the line is shown apart. */
export function errorMessage(msg: string): string {
  const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
  if (/^parse error on line \d+:?$/i.test(lines[0] ?? "") && lines.length > 1) return lines[lines.length - 1];
  return lines[0] ?? msg;
}

export function renderMermaid(src: string, theme: MockupTheme): Promise<Rendered> {
  const run = queue.then(() => render(src, theme));
  queue = run.catch(() => undefined);
  return run;
}

async function render(src: string, theme: MockupTheme): Promise<Rendered> {
  const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import("mermaid"), import("dompurify")]);
  const v = tokens();
  const vars = themeVariables(v);
  const key = theme + JSON.stringify(vars);
  if (key !== lastTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: vars,
      flowchart: { htmlLabels: false },
      c4: { ...c4Colors(v), diagramMarginY: 8, diagramMarginX: 8 },
    });
    lastTheme = key;
  }
  const id = `hmr-mermaid-${++seq}`;
  try {
    const { svg } = await mermaid.render(id, src);
    const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "script"] });
    return { svg: clean };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // mermaid leaves its error element in the body when it fails
    document.getElementById(`d${id}`)?.remove();
    return { error: errorMessage(msg), line: errorLine(msg) };
  }
}
