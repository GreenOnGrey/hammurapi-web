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
const nabu = { "mock-agent": "nabu" };

export const SCREENS: Screen[] = [
  { name: "login-github", path: "/login", cookies: visitor },
  { name: "login-gitlab", path: "/login", cookies: { ...visitor, "mock-login": "gitlab" } },
  { name: "login-oidc-error", path: "/login?error=failed", cookies: { ...visitor, "mock-login": "oidc" } },
  { name: "focus", path: "/" },
  { name: "focus-nabu", path: "/", cookies: nabu },
  { name: "focus-noagent", path: "/", cookies: { "mock-agent": "none" } },
  { name: "overview", path: "/overview" },
  { name: "research", path: "/research" },
  { name: "issue", path: "/issues/ISS.NAB-0007" },
  { name: "development", path: "/development" },
  { name: "delivery", path: "/delivery" },
  { name: "spec", path: "/spec" },
  { name: "admin", path: "/admin" },
  { name: "agent-menu", path: "/", only: "desktop", act: click("Настройки агента") },
  { name: "agent-menu-nabu", path: "/", only: "desktop", cookies: nabu, act: click("Настройки агента") },
  { name: "profile-menu", path: "/", act: click("Профиль") },
  // before FTR.NAB.CMN-0005 the button had no name on a phone, so it is found by its place
  { name: "new-issue", path: "/", act: async (page) => { await page.locator(".topbar .btn.primary").click(); } },
  // on a phone the stages live behind the burger (design §7, change 1) and the chat opens over the screen
  { name: "stages", path: "/", only: "phone", act: async (page) => { const b = page.getByRole("button", { name: "Разделы", exact: true }); if (await b.count()) await b.click(); } },
  { name: "chat-open", path: "/", only: "phone", act: click(/Хаммурапи/) },
  { name: "chat-open-nabu", path: "/", only: "phone", cookies: nabu, act: click(/Набу/) },
];
