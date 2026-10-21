import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import type { SpecDocument, SpecTree, SpecTreeFeature } from "../api/types";
import { createI18n } from "../lib/i18n";
import { readCollapsed } from "../app/session";
import { pickFile, viewHref } from "../components/FileViewer";
import { DocStatus, TreeView, findFeature, firstArea } from "./Spec";

const i18n = createI18n("ru");
const t = i18n.t;

const feat = (key: string, title: string, areas: string[], fixes: SpecTreeFeature[] = []): SpecTreeFeature => ({
  key, title, phase: "released", source: "hammurapi", areas: areas as SpecTreeFeature["areas"], fixes,
});
const tree: SpecTree = {
  commit: "c1",
  domains: [{
    key: "HMR", name: "Hammurapi",
    systems: [{
      key: "CMN", name: "Common", count: 3,
      features: [
        feat("FTR.HMR.CMN-0001", "MVP", ["product", "design", "arch", "tech", "qa"]),
        feat("FTR.HMR.CMN-0002", "Cycle", ["product", "design"], [feat("FTR.HMR.CMN-0003", "fix: stages", ["product"])]),
        feat("FTR.HMR.CMN-0042", "Indexed", ["arch", "tech"]),
      ],
    }],
  }],
};

const render = (node: React.ReactNode) =>
  renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );

// FTR.HMR.SPEC-0001 qa §2.
describe("the tree of the navigator (FTR.HMR.SPEC-0001)", () => {
  // TREE-01, TREE-02: features are the leaves; the open one is marked whatever its area.
  it("has features as leaves, without nodes of areas", () => {
    const html = render(<TreeView tree={tree} current="FTR.HMR.CMN-0001" onOpen={() => {}} />);
    expect(html).toContain('href="/spec/FTR.HMR.CMN-0001"');
    for (const area of ["Продукт", "Дизайн", "Архитектура"]) expect(html).not.toContain(`>${area}<`);
    expect(html).not.toContain("/spec/FTR.HMR.CMN-0001/");
    expect(html).toMatch(/class="node feat on"[^]*?FTR\.HMR\.CMN-0001/);
  });

  // TREE-08: a link to a fix opens its parent.
  it("opens the path to a fix", () => {
    const html = render(<TreeView tree={tree} current="FTR.HMR.CMN-0003" onOpen={() => {}} />);
    expect(html).toContain('href="/spec/FTR.HMR.CMN-0003"');
    expect(findFeature(tree, "FTR.HMR.CMN-0003")?.path).toEqual(["d:HMR", "s:HMR/CMN", "f:FTR.HMR.CMN-0002"]);
  });

  // TREE-07 (in part): only a feature with fixes has a chevron button.
  it("gives a chevron button only to a feature with fixes", () => {
    const html = render(<TreeView tree={tree} current="FTR.HMR.CMN-0001" onOpen={() => {}} />);
    expect(html.match(/<button class="specchev"/g)?.length).toBe(1);
  });

  // TREE-09: the whole "ID — title" is in the hint.
  it("puts the ID and the title in the hint", () => {
    const html = render(<TreeView tree={tree} current="FTR.HMR.CMN-0001" onOpen={() => {}} />);
    expect(html).toContain('title="FTR.HMR.CMN-0002 — Cycle"');
  });

  // TREE-03, TREE-04, TREE-06: the first area in the order of the cycle.
  it("opens the first area of a feature", () => {
    expect(firstArea(findFeature(tree, "FTR.HMR.CMN-0001")?.areas)).toBe("product");
    expect(firstArea(findFeature(tree, "FTR.HMR.CMN-0042")?.areas)).toBe("arch");
    expect(findFeature(tree, "FTR.HMR.CMN-0999")).toBeUndefined();
    expect(firstArea(undefined)).toBeUndefined();
  });
});

const doc = (f: Partial<SpecDocument["feature"]>, historyUrl?: string): Pick<SpecDocument, "historyUrl" | "feature"> => ({
  historyUrl,
  feature: {
    phase: "released", source: "hammurapi", title: "X", release: "RLS.HMR.SPEC-0001", releasedAt: "2026-11-04T10:00:00Z",
    indexedAt: null, parent: null, issues: [], pullRequests: [], ...f,
  },
});

// FTR.HMR.SPEC-0001 qa §3.
describe("the header of a document (FTR.HMR.SPEC-0001)", () => {
  // HEAD-01, HEAD-03: no "Feature" button; the release, its date and the history in one line.
  it("puts the history after the release and its date", () => {
    const html = render(<DocStatus d={doc({}, "https://git.example/h")} t={t} lng="ru" />);
    expect(html).toContain('href="/releases/RLS.HMR.SPEC-0001"');
    expect(html).toContain("Выпущено");
    expect(html).toContain("История в git");
    expect(html).not.toContain("/features/");
    expect(html.indexOf("RLS.HMR.SPEC-0001")).toBeLessThan(html.indexOf("История в git"));
    expect(html).toContain('target="_blank"');
  });

  // HEAD-04: without the history there is neither the link nor a separator before it.
  it("leaves out the history and its separator when there is no address", () => {
    const html = render(<DocStatus d={doc({})} t={t} lng="ru" />);
    expect(html).not.toContain("История в git");
    expect(html.match(/specsep/g)?.length).toBe(2); // badge · release · date
  });

  // HEAD-05, HEAD-07: an indexed specification — the time of indexing, then the history.
  it("shows the time of indexing for an indexed specification", () => {
    const indexed = { source: "repository" as const, phase: "indexed" as const, release: null, releasedAt: null, indexedAt: "2026-10-02T14:05:00Z" };
    const html = render(<DocStatus d={doc(indexed, "https://git.example/h")} t={t} lng="ru" />);
    expect(html).toContain("Проиндексировано");
    expect(html).toContain("История в git");
    const bare = render(<DocStatus d={doc({ ...indexed, indexedAt: null })} t={t} lng="ru" />);
    expect(bare).not.toContain("specsep");
  });
});

const file = (name: string, viewUrl?: string) => ({ path: `d/${name}`, name, size: 1, mimeType: "text/html", previewable: true, viewUrl });

// FTR.HMR.SPEC-0001 qa §4.
describe("the viewer of files (FTR.HMR.SPEC-0001)", () => {

  // VIEW-01: the file opened by name; the others are in the switcher.
  it("starts from the file that was opened", () => {
    const files = [file("a.png"), file("mockups.html"), file("z.html")];
    expect(pickFile(files, "mockups.html")?.name).toBe("mockups.html");
    expect(pickFile(files, "gone.html")?.name).toBe("a.png");
  });

  // VIEW-10, VIEW-11: the view link of the core, none with an older core.
  it("opens a file as a page only with the view link of the core", () => {
    expect(viewHref(file("m.html", "/api/v1/spec/files/K/design/raw?mode=view&name=m.html"))).toBe(
      "/api/v1/spec/files/K/design/raw?mode=view&name=m.html",
    );
    expect(viewHref(file("m.html"))).toBeUndefined();
  });
});

// FTR.HMR.SPEC-0001 qa §7.
describe("the folded chat (FTR.HMR.SPEC-0001)", () => {
  afterEach(() => vi.unstubAllGlobals());

  // CHAT-04: the state is read from the browser.
  it("remembers the folded chat", () => {
    vi.stubGlobal("localStorage", { getItem: () => "1", setItem: () => {} });
    expect(readCollapsed()).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => "0", setItem: () => {} });
    expect(readCollapsed()).toBe(false);
  });

  // CHAT-05: storage that throws leaves the chat open.
  it("opens the chat when the storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readCollapsed()).toBe(false);
  });
});
