import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keys } from "../api/queries";
import type { SpecChangeItem, SpecLinkRef } from "../api/types";
import { createI18n } from "../lib/i18n";
import { SpecLinks, requirementAnchor } from "./SpecLinks";
import { SpecChanges } from "./feature/SpecChanges";
import { FeatureLinks } from "./feature/FeatureLinks";
import type { DraftLayer } from "../api/types";

const wrap = (node: React.ReactNode, qc = new QueryClient()) =>
  renderToString(
    <I18nextProvider i18n={createI18n("en")}>
      <QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>
    </I18nextProvider>,
  );

const ref = (key: string, extra: Partial<SpecLinkRef> = {}): SpecLinkRef => ({ key, title: "T " + key, indexed: true, requirements: [], ...extra });
const none = { extends: [], changes: [], extendedBy: [], changedBy: [] };

// FTR.HMR.DEV-0002 qa §6b: the rows of links in the header of a document.
describe("the links of a feature", () => {
  it("NAV-06: the rows are folded by default under a line with their count and the button of the graph", () => {
    const html = wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={{ ...none, extends: [ref("FTR.NAB.CMN-0001")], changedBy: [ref("FTR.HMR.DEV-0002")] }} />);
    expect(html).toMatch(/<details class="fold"><summary>Links to other features/);
    expect(html).toContain('<span class="foldcount">2</span>');
    expect(html).toContain("Show in graph");
    expect(html).not.toMatch(/<summary>.*Show in graph.*<\/summary>/s); // a link inside the toggle is not a link
    expect(html).not.toMatch(/<details[^>]* open/);
  });
  it("NAV-02: «Changed by» with the requirement, a link to its product with the anchor", () => {
    const html = wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={{ ...none, changedBy: [ref("FTR.HMR.DEV-0002", { requirements: ["R13"] })] }} />);
    expect(html).toContain("Changed by");
    expect(html).toContain("FTR.HMR.DEV-0002");
    expect(html).toMatch(/· (<!-- -->)?R13/);
    // the number is of the document open now: the plate opens the changing feature without an anchor
    expect(html).toContain('href="/spec/FTR.HMR.DEV-0002/product"');
    expect(html).not.toContain("Builds on");
    expect(html).toContain('href="/spec/graph?focus=FTR.NAB.CMN-0005"'); // GRAPH-05: «Show in graph»
  });
  it("«Changes» opens the changed feature at its first requirement", () => {
    const html = wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={{ ...none, changes: [ref("FTR.HMR.CMN-0001", { requirements: ["R13", "R20"] })] }} />);
    expect(html).toContain('href="/spec/FTR.HMR.CMN-0001/product#r13"');
  });
  it("NAV-03: no links, no rows", () => {
    expect(wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={none} />)).toBe("");
    expect(wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" />)).toBe("");
  });
  it("NAV-04: seven links of a kind — five plates and «2 more»", () => {
    const refs = Array.from({ length: 7 }, (_, i) => ref(`FTR.FMS.CAR-000${i + 1}`));
    const html = wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={{ ...none, extends: refs }} />);
    expect(html.match(/class="chip[ "]/g)?.length).toBe(6);
    expect(html).toContain("2 more");
    expect(html).not.toContain("FTR.FMS.CAR-0006");
  });
  it("NAV-05: a key outside the index is a plate without a link", () => {
    const html = wrap(<SpecLinks featureKey="FTR.NAB.CMN-0005" links={{ ...none, extends: [ref("FTR.FMS.CAR-0077", { indexed: false, title: null })] }} />);
    expect(html).toContain("lnk-off");
    expect(html).toContain("Not in the default branch");
    expect(html).not.toContain('href="/spec/FTR.FMS.CAR-0077');
  });
  it("the anchor of a requirement paragraph", () => {
    expect(requirementAnchor("R13.")).toBe("r13");
    expect(requirementAnchor("R26a. Возврат.")).toBe("r26a");
    expect(requirementAnchor("Решение")).toBeNull();
  });
});

const render = (items: SpecChangeItem[]) => {
  const qc = new QueryClient();
  qc.setQueryData([...keys.specChanges("FTR.FMS.CAR-0042"), "product"], { items });
  return wrap(<SpecChanges featureKey="FTR.FMS.CAR-0042" />, qc);
};
const item = (extra: Partial<SpecChangeItem>): SpecChangeItem =>
  ({ feature: "FTR.FMS.CAR-0002", requirement: "R13", note: "Отмена платная.", state: "marked", url: "/spec/FTR.FMS.CAR-0002/product#r13", ...extra });

// FTR.HMR.DEV-0002 qa §4: the block of changes on the product gate.
describe("the block of changes", () => {
  it("VIEW-01, VIEW-02: rows with links and states", () => {
    const html = render([item({}), item({ requirement: null, state: "pending", url: "/spec/FTR.FMS.CAR-0002/product" })]);
    expect(html).toContain('href="/spec/FTR.FMS.CAR-0002/product#r13"');
    expect(html).toContain("marked");
    expect(html).toContain("will be marked");
    expect(html).toContain("whole feature");
  });
  it("VIEW-03: no section, no block", () => {
    expect(render([])).toBe("");
  });
  it("VIEW-05: a row with an error shows the reason", () => {
    const html = render([item({ requirement: "R99", state: "error", error: { feature: "FTR.FMS.CAR-0002", requirement: "R99", reason: "unknown_requirement" } })]);
    expect(html).toContain("st blocked");
    expect(html).toContain("No such requirement in the default branch");
  });
});

// FTR.HMR.DEV-0003 qa §2.2, §2.3: the block of arch, the links of a feature in work, the links of a layer.
describe("FTR.HMR.DEV-0003", () => {
  it("ARCH-19, DRAFT-12: the block of arch: a decision, a chevron to open a row, none on an error", () => {
    const qc = new QueryClient();
    qc.setQueryData([...keys.specChanges("FTR.FMS.CAR-0042"), "arch"], { items: [
      item({ item: "A2", kind: "decision", requirement: "A2", url: "/spec/FTR.FMS.CAR-0002/arch#a2" }),
      item({ item: "R13", requirement: "R13", state: "error", error: { feature: "FTR.FMS.CAR-0002", requirement: "R13", reason: "wrong_kind" } }),
    ] });
    const html = wrap(<SpecChanges featureKey="FTR.FMS.CAR-0042" area="arch" />, qc);
    expect(html).toContain('href="/spec/FTR.FMS.CAR-0002/arch#a2"');
    expect(html).toContain('id="changes-arch"');
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(1);
    expect(html).toContain("Product changes requirements R, arch changes decisions A");
  });
  it("DRAFT-06, DRAFT-08: the links of a feature in work by layer, with the state of the gate", () => {
    const qc = new QueryClient();
    const layers: DraftLayer[] = [
      { layer: "product", state: "approved", extends: [{ key: "FTR.HMR.DEV-0001", title: "W", indexed: true, items: [] }],
        changes: [{ key: "FTR.HMR.CMN-0002", title: "C", indexed: true, items: ["R13"] }] },
      { layer: "arch", state: "draft", extends: [{ key: "FTR.HMR.SPEC-0002", title: null, indexed: false, items: [] }],
        changes: [{ key: "FTR.HMR.CMN-0002", title: "C", indexed: true, items: ["A10"] }] },
    ];
    qc.setQueryData(["draft-links", "FTR.HMR.DEV-0003"], { layers });
    const html = wrap(<FeatureLinks featureKey="FTR.HMR.DEV-0003" />, qc);
    expect(html).toContain('<span class="foldcount">4</span>');
    expect(html).toContain("approved");
    expect(html).toContain("draft");
    expect(html).toContain('href="/features/FTR.HMR.DEV-0003/spec/product#changes-product"');
    expect(html).toContain('href="/features/FTR.HMR.DEV-0003/spec/arch#changes-arch"');
    expect(html).toMatch(/· (<!-- -->)?A10/);
    expect(html).toContain("lnk-off"); // a key outside the default branch
    expect(html).toContain("draft=1");
  });
  it("DRAFT-09: before the first revision there are no links", () => {
    const qc = new QueryClient();
    qc.setQueryData(["draft-links", "FTR.HMR.DEV-0003"], { layers: [] });
    expect(wrap(<FeatureLinks featureKey="FTR.HMR.DEV-0003" />, qc)).toBe("");
  });
  it("ARCH-15: the plates of the layer arch lead to arch, the graph with the layer", () => {
    const html = wrap(<SpecLinks featureKey="FTR.HMR.DEV-0002" area="arch" links={{ ...none, changes: [ref("FTR.HMR.CMN-0001", { requirements: ["A5"], items: ["A5"] })] }} />);
    expect(html).toContain('href="/spec/FTR.HMR.CMN-0001/arch#a5"');
    expect(html).toContain("layer=arch");
  });
});
