import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import type { PublicConfig } from "../api/types";
import { createI18n } from "../lib/i18n";
import { LoginPage } from "./Login";

const base: PublicConfig = {
  provider: "github", uploadMaxBytes: 1, uploadAllowedTypes: [], importMaxBytes: 1,
  languages: ["en"], defaultLanguage: "en", defaultBranch: "main",
};

function render(config: PublicConfig): string {
  return renderToString(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter><LoginPage config={config} /></MemoryRouter>
    </I18nextProvider>,
  );
}

// FTR.HMR.CMN-0006 IN-01…03: one button of the configured provider.
describe("sign-in screen", () => {
  it("names the OIDC provider and asks for the corporate account", () => {
    const html = render({ ...base, login: { kind: "oidc", label: "Keycloak" } });
    expect(html).toContain("Sign in with Keycloak");
    expect(html).toContain("corporate account");
  });

  it("tells that GitHub sign-in is limited to the organization", () => {
    const html = render({ ...base, login: { kind: "github", label: "GitHub", org: "GreenOnGrey" } });
    expect(html).toContain("Sign in with GitHub");
    expect(html).toContain("GreenOnGrey");
  });

  it("keeps the git provider sign-in of older servers", () => {
    expect(render({ ...base, provider: "gitlab" })).toContain("Sign in with GitLab");
  });
});
