import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@green-on-grey/ui-kit";
import { keys } from "../../api/queries";
import type { CiCheck } from "../../api/types";
import { createI18n } from "../../lib/i18n";
import { CiCheckRow, TokenModal } from "./CiCheck";

const render = (node: React.ReactNode, qc = new QueryClient()) =>
  renderToString(
    <I18nextProvider i18n={createI18n("en")}>
      <QueryClientProvider client={qc}><ToastProvider>{node}</ToastProvider></QueryClientProvider>
    </I18nextProvider>,
  );
const check = (extra: Partial<CiCheck>): CiCheck => ({ status: "none", version: null, contractVersion: "1.2.0", path: ".github/workflows/speclint.yml",
  repo: "org/specs", pr: null, error: null, checkedAt: null, ...extra });
const row = (st: CiCheck, canPropose = true) => {
  const qc = new QueryClient();
  qc.setQueryData(keys.ciCheckSpec, st);
  return render(<CiCheckRow target={{ kind: "spec" }} canPropose={canPropose} />, qc);
};

// FTR.HMR.SPEC-0002 design §1, qa SPECCI-03, SPECCI-09, SPECCI-11, TOK-08.
describe("the check in CI", () => {
  it("SPECCI-03: not connected, with «Propose PR» for those who may", () => {
    expect(row(check({}))).toContain("not connected");
    expect(row(check({}))).toContain("Propose PR");
    expect(row(check({}), false)).not.toContain("Propose PR");
  });
  it("SPECCI-09: outdated with the versions and the PR of the bump", () => {
    const html = row(check({ status: "outdated", version: "1.1.0", pr: { number: 41, url: "http://pr/41", kind: "bump" } }));
    expect(html).toMatch(/outdated · (<!-- -->)?1\.1\.0(<!-- -->)? → (<!-- -->)?1\.2\.0/);
    expect(html).toContain('href="http://pr/41"');
    expect(html).not.toContain("Propose PR");
  });
  it("SPECCI-11: changed by hand, with the hint", () => {
    expect(row(check({ status: "manual" }))).toContain("The version line was not found");
  });
  it("TOK-08: «Done» is disabled until «I saved the token»", () => {
    const html = render(<TokenModal service="booking" repo="fleet/booking" provider="github" token="hmr_svc_x" onClose={() => {}} />);
    expect(html).toContain("hmr_svc_x");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Done<\/button>/);
  });
});
