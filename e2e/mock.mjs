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
  // titles of different lengths: on a phone the action badge must stay in its place whatever the title
  research: [
    { kind: "issue", key: "ISS.HMR-0001", title: "Заменить агента на PI", action: "verify_discovery", waitingSince: T("09:00", "04") },
    { kind: "issue", key: "ISS.NAB-0001", title: "Единый UI Kit", action: "verify_discovery", waitingSince: T("09:00", "07") },
    { kind: "issue", key: "ISS.NAB-0002", title: "Подключение памяти к почте/мессенджеру", action: "verify_discovery", waitingSince: T("09:00", "07") },
    { kind: "issue", key: "ISS.NAB-0003", title: "Визард установки Nabu", action: "verify_discovery", waitingSince: T("09:00", "09") },
  ],
  development: [{ kind: "feature", key: "FTR.NAB.CMN-0005", title: "UI Kit", action: "approve_gate", waitingSince: T("12:00", "10"), hint: "Дизайн ждёт согласования" }],
  release: [], agent: [], spec: [],
};
const card = (key, title, status, extra = {}) => ({ key, title, status, issues: [], step: null, done: 2, total: 5, blocked: false, domain: "NAB", ...extra });
const overview = {
  issues: [card("ISS.NAB-0007", "Единый вид кнопок в двух продуктах", "new", { type: "idea" }), card("ISS.NAB-0008", "Скролл не у края окна", "accepted", { type: "bug", blocked: true })],
  features: [card("FTR.NAB.CMN-0005", "UI Kit", "development", { step: "tech" }), card("FTR.NAB.CMN-0004", "Поды агентов", "validation", { done: 5 })],
  releases: [card("RLS.NAB-0003", "Память коммуникаций", "deploying", { feature: "FTR.NAB.CMN-0003" })],
};
const issue = (key, type, title, status, extra = {}) => ({ key, domain: "NAB", type, title, description: "Кнопки расходятся.", source: "web", status, author: "ada",
  mergedInto: null, rejectReason: null, rolledBackRelease: null, createdAt: T("09:00", "10"), updatedAt: T("09:00", "10"), ...extra });
// titles of different lengths: on a phone the badges of a row must stay in their place whatever the title
const issues = [
  issue("ISS.NAB-0007", "idea", "Единый вид кнопок в двух продуктах", "new"),
  issue("ISS.NAB-0006", "idea", "Guardrails: контроль входящего и исходящего трафика агента", "verification"),
  issue("ISS.NAB-0003", "problem", "Визард установки Nabu", "verification", { mergedInto: "ISS.NAB-0001" }),
];
const releases = [
  { key: "RLS.NAB-0003", feature: "FTR.NAB.CMN-0003", featureTitle: "Память коммуникаций: заметки, договорённости и сводки", domain: "NAB", status: "deploying", plan: { order: [] }, metricResult: null,
    confirmedBy: null, confirmedAt: null, rollbackReason: null, rolledBackBy: null, rolledBackAt: null, blockedReason: null, createdAt: T("09:00", "09") },
  { key: "RLS.NAB-0002", feature: "FTR.NAB.CMN-0002", featureTitle: "Каналы", domain: "NAB", status: "succeeded", plan: { order: [] }, metricResult: null,
    confirmedBy: "ada", confirmedAt: T("09:00", "05"), rollbackReason: null, rolledBackBy: null, rolledBackAt: null, blockedReason: null, createdAt: T("09:00", "04") },
];
const issueCard = { ...issues[0], key: "ISS.NAB-0007", status: "discovery", movedFrom: [], features: [], releases: [], mergedFrom: [], attachments: [],
  activity: [{ id: "a2", type: "discovery_updated", actor: null, isAgent: true, createdAt: T("12:35") }, { id: "a1", type: "created", actor: "ada", isAgent: false, createdAt: T("12:34") }],
  tokensIn: 1200, tokensOut: 800, permissions: { verify: true, reopen: false, discover: true } };
const discovery = { content: "## 1. Проблема\n\nКнопки в двух продуктах выглядят по-разному.\n\n1. Веб-поиск: доработка позиции.\n2. Документы: какие системы в скоупе.\n\n**Оценка:** средняя.", value: "Единый вид",
  similar: [], systems: ["CMN"], services: [], revision: 2, updatedAt: T("12:35"), complete: true, missing: [], workflow: { state: "done", lastError: null, updatedAt: T("12:35"), nextRunAt: null },
  // FTR.HMR.DISC-0001 R15: the draft estimate (the block opens with ?estimate=open)
  estimate: { agent: [{ stage: "spec", usd: 45, tokens: 450000 }, { stage: "codegen", usd: 260, tokens: 2600000 }, { stage: "checks", usd: 95, tokens: 950000 }],
    people: [{ stage: "spec", expertise: "product", personHours: 16 }, { stage: "spec", expertise: "tech", personHours: 24 }, { stage: "approval", expertise: "product", personHours: 6 },
      { stage: "approval", expertise: "tech", personHours: 8 }, { stage: "validation", expertise: "product", personHours: 8 }, { stage: "validation", expertise: "tech", personHours: 24 },
      { stage: "release", expertise: "product", personHours: 4 }, { stage: "release", expertise: "tech", personHours: 8 }],
    days: 45, waitDays: 12, confidence: "low", basis: { features: [], judgement: true } },
  estimateTotals: { agentUsd: 400, agentTokens: 4000000, personHours: 98, days: 45, confidence: "low" }, running: null };
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

// FTR.HMR.SPEC-0001: the navigator — a tree, a released document with its links, files of the design.
const specFeat = (key, title, areas, extra = {}) => ({ key, title, phase: "released", source: "hammurapi", areas, fixes: [], ...extra });
const specTree = { commit: "c1", domains: [{ key: "NAB", name: "Nabu", systems: [{ key: "CMN", name: "Common", count: 4, features: [
  specFeat("FTR.NAB.CMN-0001", "MVP Nabu", ["product", "design", "arch", "tech", "qa"]),
  specFeat("FTR.NAB.CMN-0002", "Каналы агента", ["product", "design", "arch", "tech", "qa"], { fixes: [specFeat("FTR.NAB.CMN-0003", "fix: названия каналов", ["product"])] }),
  specFeat("FTR.NAB.CMN-0005", "Общий UI-кит Hammurapi и Nabu с очень длинным названием", ["product", "design", "arch", "tech", "qa"]),
  specFeat("FTR.NAB.CMN-0009", "Импорт из репозитория", ["arch", "tech"], { phase: "indexed", source: "repository" }),
] }] }] };
const specMarkdown = ["# Общий UI-кит", "", "## 1. Проблема", "", "Кнопки и поля в Hammurapi и Nabu выглядят по-разному.", "",
  "## 2. Требования", "", "**R1.** Один кит для двух продуктов.", "", "| Метрика | Источник | Запрос | Цель | Срок оценки | Ответственный | Комментарий |", "|---|---|---|---|---|---|---|",
  "| Расхождения | Снимки | Пары экранов с отличиями | 0 | 4 недели после релиза | Дизайн | Сравнение по пикселям без допуска |", "",
  "## 3. Скоуп", "", "Входит: R1.", ""].join("\n");
const specDoc = (key, area) => ({ featureKey: key, area, areas: ["product", "design", "arch", "tech", "qa"], path: `specs/NAB/CMN/${key}/${area}/spec.md`,
  title: "Общий UI-кит", markdown: specMarkdown, blobSha: "b1", commit: "c1",
  toc: [{ level: 2, text: "1. Проблема", slug: "1-problema" }, { level: 2, text: "2. Требования", slug: "2-trebovaniya" }, { level: 2, text: "3. Скоуп", slug: "3-skoup" }],
  historyUrl: `https://github.com/GreenOnGrey/specs/commits/main/specs/NAB/CMN/${key}/${area}/spec.md`,
  feature: { phase: "released", source: "hammurapi", title: "Общий UI-кит Hammurapi и Nabu с очень длинным названием", release: "RLS.NAB.CMN-0003", releasedAt: T("12:00", "04"),
    indexedAt: null, parent: null, issues: [{ key: "ISS.NAB-0007", title: "Кнопки расходятся", url: "/issues/ISS.NAB-0007" }], pullRequests: [] } });
const viewUrl = (key, area, name) => `/api/v1/spec/files/${key}/${area}/raw?mode=view&name=${name}`;
const specFiles = (key, area) => area !== "design" ? [] : [
  { path: `specs/NAB/CMN/${key}/design/mockups.html`, name: "mockups.html", size: 158_000, mimeType: "text/html", previewable: true, viewUrl: viewUrl(key, area, "mockups.html") },
  { path: `specs/NAB/CMN/${key}/design/flows.pdf`, name: "flows.pdf", size: 2_300_000, mimeType: "application/pdf", previewable: false },
];
const MOCKUP = "<!doctype html><body style=\"margin:0;font:16px sans-serif;background:#eeedf3\"><div style=\"padding:24px 32px;background:#6d4aff;color:#fff\">Макеты</div><div style=\"display:grid;grid-template-columns:220px 1fr 300px;gap:16px;padding:24px\"><div style=\"height:400px;background:#fff\"></div><div style=\"height:400px;background:#fff\"></div><div style=\"height:400px;background:#fff\"></div></div></body>";

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
  if (p === "/api/v1/releases") return { items: releases, nextCursor: null };
  if (/^\/api\/v1\/issues\/[^/]+$/.test(p)) return issueCard;
  if (/^\/api\/v1\/issues\/[^/]+\/discovery$/.test(p)) return discovery;
  if (p === "/api/v1/chat/session") return { model: "sonnet-5", connectionName: "Anthropic", thinking: "medium", configured: true };
  if (p === "/api/v1/chat/history") return { items: history, nextCursor: null };
  if (p === "/api/v1/agent") return nabuAgent;
  if (p === "/api/v1/spec/tree") return specTree;
  let m = /^\/api\/v1\/spec\/documents\/([^/]+)\/([^/]+)$/.exec(p);
  if (m) return specDoc(decodeURIComponent(m[1]), m[2]);
  m = /^\/api\/v1\/spec\/files\/([^/]+)\/([^/]+)$/.exec(p);
  if (m) return { files: specFiles(decodeURIComponent(m[1]), m[2]) };
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
    // FTR.HMR.SPEC-0001 arch §6: a mockup as a page of its own, sandboxed into an opaque origin
    if (url.pathname.endsWith("/raw") && url.searchParams.get("mode") === "view") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "sandbox allow-scripts" });
      return res.end(MOCKUP);
    }
    if (url.pathname === "/api/v1/auth/me" && cookie("mock-auth") === "0") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":{"code":"unauthenticated","message":"sign in"}}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(api(url, cookie)));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
