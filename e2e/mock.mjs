// A mock of the Hammurapi API with fixed data that serves one build of
// hammurapi-web — the server of the screen comparison (FTR.NAB.CMN-0005 qa §6):
//   DIST=<dist of a build> PORT=<n> node e2e/mock.mjs
// The state of a request comes with its cookies, so screens are shot in parallel:
//   mock-theme=light|dark     the theme of the profile
//   mock-auth=0               a visitor: /api/v1/auth/me answers 401 and the app shows sign-in
//   mock-agent=builtin|nabu|none   which chat the panel shows (FTR.HMR.CMN-0006)
//   mock-login=github|gitlab|oidc  the provider of sign-in
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve(process.env.DIST ?? "dist");
const PORT = Number(process.env.PORT ?? 5300);
const T = (hm, day = "11") => `2026-10-${day}T${hm}:00Z`;

const me = (theme) => ({ id: "u1", username: "ada", displayName: "Ада Лавлейс", avatarUrl: null, globalAdmin: true, areaAdmin: [], experts: [{ domain: "NAB", kinds: ["product", "technical"] }],
  ownedServices: ["nabu-web"], language: "ru", theme, agentName: "Хаммурапи", agentTone: "concise", email: "ada@example.com", gitAccount: { login: "ada", provider: "github" } });
const profile = (theme) => ({ language: "ru", theme, domains: ["NAB"], agentName: "Хаммурапи", agentTone: "concise" });
const LOGIN = { github: { kind: "github", label: "GitHub", org: "GreenOnGrey", linksGit: true }, gitlab: { kind: "git", label: "GitLab", linksGit: true }, oidc: { kind: "oidc", label: "Keycloak" } };
const config = (agent, login) => ({ provider: login === "gitlab" ? "gitlab" : "github", login: LOGIN[login] ?? LOGIN.github,
  agent: agent === "none" ? { enabled: false } : { enabled: true, provider: agent === "nabu" ? "nabu" : "builtin" },
  uploadMaxBytes: 20000000, uploadAllowedTypes: ["image/png", "application/pdf"], importMaxBytes: 50000000, languages: ["en", "ru", "de", "es", "zh-CN"], defaultLanguage: "en", defaultBranch: "main" });
const domains = [{ key: "NAB", name: "Nabu", approvalRequired: true, source: "manual", deletedInCatalog: false, createdAt: T("09:00", "01"), systems: [{ key: "CMN", name: "Common" }], experts: { product: [], technical: [] } }];
const focus = {
  research: [{ kind: "issue", key: "ISS.NAB-0007", title: "Единый вид кнопок в двух продуктах", action: "verify_discovery", waitingSince: T("09:00", "10") }],
  development: [{ kind: "feature", key: "FTR.NAB.CMN-0005", title: "UI Kit", action: "approve_gate", waitingSince: T("12:00", "10"), hint: "Дизайн ждёт согласования" }],
  release: [], agent: [], spec: [],
};
const card = (key, title, status, extra = {}) => ({ key, title, status, issues: [], step: null, done: 2, total: 5, blocked: false, domain: "NAB", ...extra });
const overview = {
  issues: [card("ISS.NAB-0007", "Единый вид кнопок в двух продуктах", "new", { type: "idea" }), card("ISS.NAB-0008", "Скролл не у края окна", "accepted", { type: "bug", blocked: true })],
  features: [card("FTR.NAB.CMN-0005", "UI Kit", "development", { step: "tech" }), card("FTR.NAB.CMN-0004", "Поды агентов", "validation", { done: 5 })],
  releases: [card("RLS.NAB-0003", "Память коммуникаций", "deploying", { feature: "FTR.NAB.CMN-0003" })],
};
const issues = [{ key: "ISS.NAB-0007", domain: "NAB", type: "idea", title: "Единый вид кнопок в двух продуктах", description: "Кнопки расходятся.", source: "web", status: "new", author: "ada", mergedInto: null, rejectReason: null, rolledBackRelease: null, createdAt: T("09:00", "10"), updatedAt: T("09:00", "10") }];
const chatMsg = (id, role, content, extra = {}) => ({ id, role, mode: "general", context: null, content, isVoice: false, attachments: [], model: "sonnet", errorClass: null, retryOf: null, createdAt: T("14:00"), ...extra });
// the newest first, as the API gives the history
const history = [
  chatMsg("h4", "agent", "Без тестов остаются три требования:\n\n- **R17** — перечень изменений\n- **R23** — запрет переопределений\n\n| Требование | Тест |\n|---|---|\n| R17 | `HMR-01` |", { createdAt: T("14:03") }),
  chatMsg("h3", "user", "Какие требования ещё не покрыты тестами?", { createdAt: T("14:02"), mode: "spec", context: { type: "feature", key: "FTR.NAB.CMN-0005", area: "qa" } }),
  chatMsg("h2", "agent", "Готово: напомню завтра в 10:00.", { createdAt: T("13:01") }),
  chatMsg("h1", "user", "Напомни завтра в 10 про ревью", { createdAt: T("13:00"), isVoice: true }),
];
const nabuAgent = { name: "Набу", tone: "business", model: { name: "sonnet-5", connection: "Anthropic" } };
const nabuConversations = [{ id: "main", kind: "main", title: null, lastMessageAt: T("14:03"), archivedAt: null, createdAt: T("09:00", "01") },
  { id: "t1", kind: "topic", title: "Релиз 1.4", lastMessageAt: T("10:00"), archivedAt: null, createdAt: T("09:00", "05") }];
const nabuMsg = (id, role, text, extra = {}) => ({ id, conversationId: "main", role, text, channel: "client:hammurapi", status: "done", attachments: [], toolSteps: [], context: null, errorClass: null, errorText: null, createdAt: T("14:00"), ...extra });
const nabuMessages = [
  nabuMsg("n1", "user", "Какие требования ещё не покрыты тестами?", { createdAt: T("14:02"), context: { type: "feature", key: "FTR.NAB.CMN-0005", area: "qa" } }),
  nabuMsg("n2", "assistant", "Без тестов остаются три требования:\n\n- **R17** — перечень изменений\n- **R23** — запрет переопределений", { createdAt: T("14:03"),
    toolSteps: [{ id: "s1", server: "hammurapi", tool: "spec_read", summary: "spec_read — FTR.NAB.CMN-0005", status: "done" }] }),
  nabuMsg("n3", "user", "Напомни завтра в 10 про ревью", { createdAt: T("14:10"), channel: "telegram" }),
  nabuMsg("n4", "assistant", "", { createdAt: T("14:10"), status: "failed", errorClass: "rate_limit" }),
];

function api(url, c) {
  const p = url.pathname;
  if (p === "/api/v1/config") return config(c("mock-agent"), c("mock-login"));
  if (p === "/api/v1/auth/me") return me(c("mock-theme") ?? "light");
  if (p === "/api/v1/profile") return profile(c("mock-theme") ?? "light");
  if (p === "/api/v1/domains") return domains;
  if (p === "/api/v1/services") return [];
  if (p === "/api/v1/focus") return focus;
  if (p === "/api/v1/overview") return overview;
  if (p === "/api/v1/issues") return { items: issues, nextCursor: null };
  if (p === "/api/v1/chat/session") return { model: "sonnet-5", connectionName: "Anthropic", thinking: "medium", configured: true };
  if (p === "/api/v1/chat/history") return { items: history, nextCursor: null };
  if (p === "/api/v1/agent") return nabuAgent;
  if (p === "/api/v1/chat/conversations") return { items: nabuConversations };
  if (/^\/api\/v1\/chat\/conversations\/[^/]+\/messages$/.test(p)) return { items: p.includes("/main/") ? nabuMessages : [], nextCursor: null };
  return { items: [], nextCursor: null };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".map": "application/json" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cookie = (name) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(req.headers.cookie ?? "")?.[1];
  // A page in a frame of an exact width, for a look without Playwright:
  //   /__frame?p=/overview&w=390&h=844&theme=dark&agent=nabu&auth=0&login=oidc
  if (url.pathname === "/__frame") {
    const q = url.searchParams;
    const theme = q.get("theme") ?? "light";
    const set = [["mock-theme", theme], ["mock-auth", q.get("auth") ?? "1"], ["mock-agent", q.get("agent") ?? "builtin"], ["mock-login", q.get("login") ?? "github"]];
    res.writeHead(200, { "content-type": "text/html", "set-cookie": set.map(([k, v]) => `${k}=${v}; Path=/`) });
    return res.end(`<!doctype html><body style="margin:0;background:#888"><script>try{localStorage.setItem("hmr-theme","${theme}")}catch(e){}</script><iframe src="${q.get("p") ?? "/"}" width="${q.get("w") ?? 1280}" height="${q.get("h") ?? 860}" style="border:0;display:block"></iframe></body>`);
  }
  if (url.pathname === "/config.json") { res.writeHead(404); return res.end(); }
  if (url.pathname === "/api/v1/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    // closed at once and not to be retried soon: an open stream would keep a page from settling
    return res.end("retry: 600000\n\n");
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/api/")) {
    if (req.method !== "GET") { res.writeHead(204); return res.end(); }
    if (url.pathname === "/api/v1/auth/me" && cookie("mock-auth") === "0") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":{"code":"unauthenticated","message":"sign in"}}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(api(url, cookie)));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
