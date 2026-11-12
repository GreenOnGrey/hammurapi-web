import type { Page } from "@playwright/test";

// The screens of the comparison (FTR.NAB.CMN-0005 qa §6): the routes, the three
// chats of the panel and the states that appear after a click. `only` limits a
// screen to one width; `cookies` choose the state of the mock (e2e/mock.mjs).
export interface Screen {
  name: string;
  path: string;
  cookies?: Record<string, string>;
  only?: "desktop" | "phone";
  /** What to do after the page has settled, before the shot. */
  act?: (page: Page) => Promise<void>;
}

const click = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole("button", { name, exact: typeof name === "string" }).first().click();
};
const visitor = { "mock-auth": "0" };

export const SCREENS: Screen[] = [
  { name: "login-github", path: "/login", cookies: visitor },
  { name: "login-gitlab", path: "/login", cookies: { ...visitor, "mock-login": "gitlab" } },
  { name: "login-oidc-error", path: "/login?error=failed", cookies: { ...visitor, "mock-login": "oidc" } },
  { name: "focus", path: "/" },
  { name: "overview", path: "/overview" },
  { name: "research", path: "/research" },
  { name: "issue", path: "/issues/ISS.NAB-0007" },
  { name: "development", path: "/development" },
  { name: "delivery", path: "/delivery" },
  { name: "spec", path: "/spec" },
  // FTR.HMR.SPEC-0001 qa §8: the tree of features, the header without buttons, the folded chat, the viewer
  { name: "spec-doc", path: "/spec/FTR.NAB.CMN-0005/product" },
  { name: "spec-tree", path: "/spec", only: "phone" },
  { name: "spec-chat-collapsed", path: "/spec/FTR.NAB.CMN-0005/product", only: "desktop", act: click("Свернуть чат") },
  { name: "spec-viewer", path: "/spec/FTR.NAB.CMN-0005/design", act: click("Открыть") },
  // FTR.HMR.DISC-0001 design §3.7a: the tab «Анализ» of the navigator and of the feature, with the materials of the research
  { name: "spec-discovery", path: "/spec/FTR.NAB.CMN-0005/discovery", cookies: { "mock-discovery": "1" } },
  { name: "feature-discovery", path: "/features/FTR.FMS.CAR-0005/spec/discovery", cookies: { "mock-discovery": "1" } },
  // FTR.HMR.DEV-0001 design §4: the stages, the panel of the specifications, the questions of the writer, the gates as icons
  { name: "feature-spec", path: "/features/FTR.FMS.CAR-0005" },
  // FTR.HMR.DEV-0002 design §3.1, §3.5: the block of changes on product, the links in the header of a document
  { name: "feature-changes", path: "/features/FTR.FMS.CAR-0005", cookies: { "mock-feature": "changes" },
    act: async (page) => { await page.locator(".chgblock").scrollIntoViewIfNeeded(); } },
  { name: "spec-doc-links", path: "/spec/FTR.NAB.CMN-0005/product", cookies: { "mock-links": "1" } },
  // FTR.HMR.DEV-0003 design §3.1–§3.5, §3.9: the mockup on the gate, the links of a feature in work by layer,
  // the block of arch with a row opened, the rules with the required structure and the banner of a broken template
  { name: "feature-mockup", path: "/features/FTR.FMS.CAR-0005/spec/design?view=mockup&file=mockups.html", cookies: { "mock-feature": "dev3" } },
  { name: "feature-links", path: "/features/FTR.FMS.CAR-0005/spec/design", cookies: { "mock-feature": "dev3" },
    act: async (page) => { await page.locator(".featurelinks summary").click(); } },
  { name: "feature-arch-changes", path: "/features/FTR.FMS.CAR-0005/spec/arch", cookies: { "mock-feature": "dev3" },
    act: async (page) => { await page.locator(".chgchev").first().click(); await page.locator(".chgnow-text").waitFor(); await page.locator(".chgblock").scrollIntoViewIfNeeded(); } },
  { name: "admin-rules-contract", path: "/admin/rules", cookies: { "mock-rules": "broken" } },
  // FTR.HMR.SPEC-0002 design §2, §3: the check in CI of the specifications and of a service
  { name: "admin-settings-ci", path: "/admin/settings" },
  { name: "admin-service-ci", path: "/admin/services", cookies: { "mock-ci": "1" }, act: async (page) => {
    await click("Изменить")(page);
    await page.getByText("Проверка тестов в CI").scrollIntoViewIfNeeded();
  } },
  // FTR.HMR.SPEC-0004 design §3.1, §3.3: the C4 diagram read, edited, broken; the contracts of tech as API
  { name: "feature-c4", path: "/features/FTR.FMS.CAR-0005/spec/arch", cookies: { "mock-feature": "dev3", "mock-c4": "read" },
    act: async (page) => { await page.locator(".mermaid-canvas svg").waitFor(); await page.locator(".mermaid-diagram").scrollIntoViewIfNeeded(); } },
  { name: "feature-c4-edit", path: "/features/FTR.FMS.CAR-0005/spec/arch", only: "desktop", cookies: { "mock-feature": "dev3", "mock-c4": "edit" },
    act: async (page) => { await page.locator(".mermaid-canvas svg").waitFor(); await page.locator(".mermaid-diagram").scrollIntoViewIfNeeded(); } },
  { name: "feature-c4-error", path: "/features/FTR.FMS.CAR-0005/spec/arch", only: "desktop", cookies: { "mock-feature": "dev3", "mock-c4": "error" },
    act: async (page) => { await page.locator(".mermaid-error").waitFor(); await page.locator(".mermaid-error").scrollIntoViewIfNeeded(); } },
  { name: "feature-api-openapi", path: "/features/FTR.FMS.CAR-0005/spec/tech?view=api&file=booking.openapi.yaml", only: "desktop", cookies: { "mock-feature": "generated" },
    act: async (page) => { await page.locator(".oa-op-head").nth(1).click(); await page.locator(".oa-ref").first().click(); await page.locator(".oa-model.open").waitFor(); } },
  { name: "feature-api-proto", path: "/features/FTR.FMS.CAR-0005/spec/tech?view=api&file=pricing.proto", only: "desktop", cookies: { "mock-feature": "generated" },
    act: async (page) => { await page.locator(".protoview-code").waitFor(); } },
  // FTR.HMR.DEV-0002 design §3.6: the graph, by domain, with the focus at depth 2
  { name: "spec-graph", path: "/spec/graph", only: "desktop" },
  { name: "spec-graph-free", path: "/spec/graph?layout=free", only: "desktop" },
  { name: "spec-graph-focus", path: "/spec/graph?domain=HMR&focus=FTR.HMR.DEV-0002&depth=2", only: "desktop" },
  // FTR.HMR.DEV-0003 design §3.6: the layer of arch, both layers with a feature in work
  { name: "spec-graph-arch", path: "/spec/graph?layer=arch&domain=HMR", only: "desktop" },
  { name: "spec-graph-draft", path: "/spec/graph?focus=FTR.FMS.CAR-0005&draft=1&layer=both", cookies: { "mock-feature": "dev3" }, only: "desktop" },
  { name: "feature-writer-running", path: "/features/FTR.FMS.CAR-0005", cookies: { "mock-feature": "running" } },
  { name: "feature-return", path: "/features/FTR.FMS.CAR-0005/spec/arch", cookies: { "mock-feature": "return" } },
  { name: "feature-no-approval", path: "/features/FTR.FMS.CAR-0005", cookies: { "mock-feature": "noapproval" } },
  { name: "feature-codegen", path: "/features/FTR.FMS.CAR-0005/implementation", cookies: { "mock-feature": "codegen" } },
  // FTR.HMR.DEV-0004 design §3.2, §3.4: the popover of the cost of a service and the panel of the log of a task
  { name: "feature-cost", path: "/features/FTR.FMS.CAR-0005/implementation", cookies: { "mock-feature": "codegen" },
    act: async (page) => { await page.getByRole("button", { name: /^Стоимость: \$41/ }).click(); await page.getByText("Чтение кэша в несколько раз дешевле").waitFor(); } },
  { name: "feature-log", path: "/features/FTR.FMS.CAR-0005/implementation?log=run-t1", cookies: { "mock-feature": "codegen" },
    act: async (page) => { await page.locator(".runlog").getByText("create the tree").waitFor(); } },
  // qa LOG-24: the switcher of runs is the Select of the kit, its list in the theme
  { name: "feature-log-runs", path: "/features/FTR.FMS.CAR-0005/implementation", cookies: { "mock-feature": "codegen" },
    act: async (page) => {
      await page.getByRole("button", { name: "Лог", exact: true }).first().click();
      await page.locator(".runlog").getByText("create the tree").waitFor();
      await page.locator(".runlog").getByRole("button", { name: "Запуски задачи" }).click();
      await page.getByRole("listbox", { name: "Запуски задачи" }).waitFor();
    } },
  { name: "feature-generated", path: "/features/FTR.FMS.CAR-0005/spec/tech", cookies: { "mock-feature": "generated" } },
  { name: "admin", path: "/admin" },
  // FTR.HMR.CMN-0007 design §3.6: the connection and the binding; Nabu does not answer
  { name: "admin-nabu", path: "/admin/nabu" },
  { name: "admin-nabu-down", path: "/admin/nabu", cookies: { "mock-nabu": "down" } },
  { name: "agent-menu", path: "/", only: "desktop", act: click("Настройки агента") },
  { name: "profile-menu", path: "/", act: click("Профиль") },
  // before FTR.NAB.CMN-0005 the button had no name on a phone, so it is found by its place
  { name: "new-issue", path: "/", act: async (page) => { await page.locator(".topbar .btn.primary").click(); } },
  // on a phone the stages live behind the burger (design §7, change 1) and the chat opens over the screen
  { name: "stages", path: "/", only: "phone", act: async (page) => { const b = page.getByRole("button", { name: "Разделы", exact: true }); if (await b.count()) await b.click(); } },
  // FTR.NAB.CMN-0005 design §4: in the administration the burger holds its sections
  { name: "admin-sections", path: "/admin", only: "phone", act: click("Администрирование") },
  { name: "chat-open", path: "/", only: "phone", act: click(/Набу/) },
  // FTR.HMR.CMN-0007 FL-03, FL-04: the file of the agent opens in the chat, a spreadsheet by the preview of Nabu
  { name: "chat-file-table", path: "/", only: "desktop", act: async (page) => {
    await page.getByRole("button", { name: "Открыть coverage.csv" }).click();
    await page.getByRole("dialog").locator("table").waitFor();
  } },
  { name: "chat-file-sheet", path: "/", only: "desktop", act: async (page) => {
    await page.getByRole("button", { name: "Открыть coverage.xlsx" }).click();
    await page.getByRole("dialog").getByText("R17").waitFor();
  } },
];
