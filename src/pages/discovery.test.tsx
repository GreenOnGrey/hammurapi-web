import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import type { FeatureDiscovery } from "../api/types";
import { createI18n } from "../lib/i18n";
import { DiscoveryPane, hasDiscovery } from "./feature/DiscoveryPane";
import { firstArea } from "./Spec";

const i18n = createI18n("ru");
const render = (node: React.ReactNode) =>
  renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );

const materials: FeatureDiscovery = {
  ref: "feature/FTR.FMS.CAR-0012",
  document: null,
  files: [
    { name: "deck.pptx", size: 2048, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", blobSha: "a", previewable: false },
    { name: "flow.png", size: 512, mimeType: "image/png", blobSha: "b", previewable: true, viewUrl: "/api/v1/features/FTR.FMS.CAR-0012/discovery/files/raw?name=flow.png" },
  ],
};

// FTR.HMR.DISC-0001 qa §5d.
describe("the materials of the research (FTR.HMR.DISC-0001 R30)", () => {
  // DF-13: the tab is shown only with a document or materials; the materials open or download from discovery/.
  it("lists the materials and downloads them from the folder discovery", () => {
    expect(hasDiscovery(undefined)).toBe(false);
    expect(hasDiscovery({ ref: "r", document: null, files: [] })).toBe(false);
    expect(hasDiscovery(materials)).toBe(true);
    const html = render(<DiscoveryPane featureId="FTR.FMS.CAR-0012" data={materials} loading={false} error={null} />);
    expect(html).toContain("Материалы");
    expect(html).toContain("deck.pptx");
    expect(html).toContain("/api/v1/features/FTR.FMS.CAR-0012/discovery/files/raw?name=deck.pptx");
    // only the image opens for viewing; the presentation only downloads
    expect(html.match(/>Открыть</g)?.length).toBe(1);
    expect(html.match(/>Скачать</g)?.length).toBe(2);
  });

  it("says so when there is nothing", () => {
    const html = render(<DiscoveryPane featureId="FTR.FMS.CAR-0012" data={{ ref: "r", document: null, files: [] }} loading={false} error={null} />);
    expect(html).toContain("Нет документа анализа и материалов");
  });

  // DF-14: a feature still opens on its first gate, not on discovery.
  it("opens a feature on the first gate", () => {
    expect(firstArea(["discovery", "product", "arch"])).toBe("product");
    expect(firstArea(["discovery"])).toBeUndefined();
  });
});
