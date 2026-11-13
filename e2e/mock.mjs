// A mock of the Hammurapi API with fixed data that serves one build of
// hammurapi-web — the server of the screen comparison (FTR.NAB.CMN-0005 qa §6):
//   DIST=<dist of a build> PORT=<n> node e2e/mock.mjs
// The state of a request comes with its cookies, so screens are shot in parallel:
//   mock-theme=light|dark     the theme of the profile
//   mock-auth=0               a visitor: /api/v1/auth/me answers 401 and the app shows sign-in
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
const config = (login) => ({ provider: login === "gitlab" ? "gitlab" : "github", login: LOGIN[login] ?? LOGIN.github,
  nabuWebUrl: "https://nabu.example.com",
  uploadMaxBytes: 20000000, uploadAllowedTypes: ["image/png", "application/pdf"], importMaxBytes: 50000000, languages: ["en", "ru", "de", "es", "zh-CN"], defaultLanguage: "en", defaultBranch: "main", contractVersion: "1.1.0" });
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
// FTR.HMR.CMN-0007 design §3.6: mock-nabu=down — Nabu does not answer
const nabuAdmin = (state) => ({ url: "https://nabu-api.example.com", client: "hammurapi", connected: state !== "down",
  ...(state === "down" ? { error: "nabu is unavailable", lastOkAt: T("09:30") } : {}),
  agents: state === "down" ? [] : [{ name: "hammurapi-codegen", description: "", workspace: "nabu", workspaceProfile: "code", proxies: ["packages"] },
    { name: "hammurapi-issue-analysis", description: "", workspace: "none" }],
  scenarios: { issue_analysis: "hammurapi-issue-analysis", codegen: "hammurapi-codegen", review_update: "hammurapi-issue-analysis" },
  scenarioRows: [["issue_analysis", false], ["gate_generation", false], ["conformance_check", false], ["codegen", true], ["review_update", true], ["rollback_revert", true]]
    .map(([name, code]) => ({ name, code })) });
const nabuAgent = { previewOffice: true, name: "Набу", tone: "business", model: { name: "sonnet-5", connection: "Anthropic" } };
const nabuConversations = [{ id: "main", kind: "main", title: null, lastMessageAt: T("14:03"), archivedAt: null, createdAt: T("09:00", "01") },
  { id: "t1", kind: "topic", title: "Релиз 1.4", lastMessageAt: T("10:00"), archivedAt: null, createdAt: T("09:00", "05") }];
const nabuMsg = (id, role, text, extra = {}) => ({ id, conversationId: "main", role, text, channel: "client:hammurapi", status: "done", attachments: [], toolSteps: [], context: null, errorClass: null, errorText: null, createdAt: T("14:00"), ...extra });
const nabuMessages = [
  nabuMsg("n1", "user", "Какие требования ещё не покрыты тестами?", { createdAt: T("14:02"), context: { type: "feature", key: "FTR.NAB.CMN-0005", area: "qa" } }),
  nabuMsg("n2", "assistant", "Без тестов остаются три требования:\n\n- **R17** — перечень изменений\n- **R23** — запрет переопределений", { createdAt: T("14:03"),
    attachments: [{ id: "f1", fileName: "coverage.csv", mimeType: "text/csv", size: 2048 }, { id: "f2", fileName: "coverage.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 8192 }],
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
// FTR.HMR.DEV-0002 R14, R17: links of the feature, by the cookie mock-links
const linkRef = (key, title, requirements = [], indexed = true) => ({ key, title: indexed ? title : null, indexed, requirements });
const specLinks = {
  extends: [linkRef("FTR.NAB.CMN-0001", "Nabu"), linkRef("FTR.NAB.CMN-0009", "", [], false)],
  changes: [linkRef("FTR.HMR.CMN-0001", "Hammurapi", ["R13", "R20"])],
  extendedBy: Array.from({ length: 7 }, (_, i) => linkRef(`FTR.NAB.CHAT-000${i + 1}`, "Чат")),
  changedBy: [linkRef("FTR.HMR.DEV-0002", "Связи решений", ["R10"])],
};
// FTR.HMR.DEV-0002 R15–R17: the graph of the specification
const gNode = (key, title, phase = "released", indexed = true) => {
  const [, domain, rest] = key.split(".");
  return { key, title: indexed ? title : null, domain, system: rest.split("-")[0], phase: indexed ? phase : null, indexed, context: false };
};
const gEdge = (source, target, kind, requirements = [], layer = "product") => ({ source, target, kind, requirements, layer });
const specGraph = { commit: "c1",
  nodes: [gNode("FTR.HMR.CMN-0001", "Hammurapi"), gNode("FTR.HMR.CMN-0002", "Цикл разработки"), gNode("FTR.HMR.CMN-0005", "Индекс спецификаций"),
    gNode("FTR.HMR.DEV-0001", "Писатель спецификаций"), gNode("FTR.HMR.DEV-0002", "Связи решений", "spec"), gNode("FTR.NAB.CMN-0001", "Nabu"),
    gNode("FTR.NAB.CMN-0003", "Память"), gNode("FTR.NAB.CMN-0005", "Общий UI-кит"), gNode("FTR.NAB.CMN-0009", "", "spec", false),
    gNode("FTR.FMS.CAR-0001", "Каталог машин"), gNode("FTR.FMS.CAR-0002", "Бронь")],
  edges: [gEdge("FTR.HMR.CMN-0002", "FTR.HMR.CMN-0001", "extends"), gEdge("FTR.HMR.CMN-0005", "FTR.HMR.CMN-0001", "extends"),
    gEdge("FTR.HMR.DEV-0001", "FTR.HMR.CMN-0002", "changes", ["R12", "R13", "R14"]), gEdge("FTR.HMR.DEV-0002", "FTR.HMR.DEV-0001", "extends"),
    gEdge("FTR.HMR.DEV-0002", "FTR.HMR.CMN-0001", "changes", ["R13"]), gEdge("FTR.HMR.DEV-0002", "FTR.NAB.CMN-0005", "extends"),
    gEdge("FTR.NAB.CMN-0003", "FTR.NAB.CMN-0001", "extends"), gEdge("FTR.NAB.CMN-0005", "FTR.NAB.CMN-0003", "changes", ["R19"]),
    gEdge("FTR.NAB.CMN-0005", "FTR.NAB.CMN-0009", "extends"), gEdge("FTR.FMS.CAR-0002", "FTR.FMS.CAR-0001", "extends"),
    // FTR.HMR.DEV-0003 R15: the layer of arch
    gEdge("FTR.HMR.DEV-0002", "FTR.HMR.CMN-0005", "changes", ["A5"], "arch"), gEdge("FTR.HMR.DEV-0002", "FTR.HMR.DEV-0001", "extends", [], "arch"),
    gEdge("FTR.FMS.CAR-0002", "FTR.FMS.CAR-0001", "extends", [], "arch")] };
const graphOf = (layer) => ({ ...specGraph, edges: specGraph.edges.filter((e) => layer === "both" || e.layer === (layer || "product")) });
const viewUrl = (key, area, name) => `/api/v1/spec/files/${key}/${area}/raw?mode=view&name=${name}`;
const specFiles = (key, area) => area === "discovery" ? discoveryFiles.map((f) => ({ ...f, path: `specs/NAB/CMN/${key}/discovery/${f.name}`,
  viewUrl: f.viewUrl && viewUrl(key, area, f.name) })) : area !== "design" ? [] : [
  { path: `specs/NAB/CMN/${key}/design/mockups.html`, name: "mockups.html", size: 158_000, mimeType: "text/html", previewable: true, viewUrl: viewUrl(key, area, "mockups.html") },
  { path: `specs/NAB/CMN/${key}/design/flows.pdf`, name: "flows.pdf", size: 2_300_000, mimeType: "application/pdf", previewable: false },
];
// FTR.HMR.DISC-0001 R30: the materials of the research, by the cookie mock-discovery
const discoveryMd = "# Скидка за ранний возврат\n\n## Проблема\n\nКлиенты возвращают машины раньше срока и не получают ничего за освобождённые часы.\n\n## Риски\n\n- Скидка съедает выручку выходных.\n";
const discoveryFiles = [
  { name: "interviews.pdf", size: 1_240_000, mimeType: "application/pdf", blobSha: "d2", previewable: false },
  { name: "return-flow.png", size: 84_000, mimeType: "image/png", blobSha: "d1", previewable: true, viewUrl: "/api/v1/features/FTR.FMS.CAR-0005/discovery/files/raw?mode=view&name=return-flow.png&v=d1" },
  { name: "roadmap.pptx", size: 3_400_000, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", blobSha: "d3", previewable: false },
];
const MOCKUP = "<!doctype html><body style=\"margin:0;font:16px sans-serif;background:#eeedf3\"><div style=\"padding:24px 32px;background:#6d4aff;color:#fff\">Макеты</div><div style=\"display:grid;grid-template-columns:220px 1fr 300px;gap:16px;padding:24px\"><div style=\"height:400px;background:#fff\"></div><div style=\"height:400px;background:#fff\"></div><div style=\"height:400px;background:#fff\"></div></div></body>";

// FTR.HMR.DEV-0001: a feature with the writer. mock-feature: questions (default), return, noapproval, generated, skipped.
const featureGate = (area, status, generated = false) => ({ area, status, generated, headCommit: "c0", approvedCommit: status === "approved" ? "c0" : null,
  approvedBy: status === "approved" ? "Анна Петрова" : null, approvedAt: status === "approved" ? "2026-10-20T10:00:00Z" : null, submittedAt: status === "in_review" ? "2026-10-21T10:00:00Z" : null, deleted: false });
function feature(state) {
  const base = { uniqueId: "FTR.FMS.CAR-0005", domain: "FMS", system: "CAR", title: "Скидка за ранний возврат авто", phase: "spec", approvalRequired: true, isProblem: false, imported: false,
    branch: "ftr", pr: { number: 41, url: "http://pr" }, parent: null, fixes: [], issues: ["ISS.FMS-0007"], services: [], release: null, metric: null, flagKey: null, pendingGates: ["tech", "qa"], lock: null,
    workflow: null, tokensIn: 0, tokensOut: 0, createdBy: "Анна Петрова", createdAt: "2026-10-20T10:00:00Z", specFlow: "writer", specStage: "product", skippedAreas: [], writerRun: null, openQuestions: {},
    permissions: { edit: ["product"], submit: ["product"], approve: [], delete: true, setFlag: true, codegen: false, advance: false, request: true, retry: false, deleteGate: [], addGate: [], regenerate: false } };
  if (state === "return") return { ...base, specStage: "arch", gates: [featureGate("product", "draft"), featureGate("design", "approved"), featureGate("arch", "in_review")], openQuestions: { arch: 1 },
    permissions: { ...base.permissions, edit: ["product", "design", "arch"], submit: ["product"], approve: ["arch"] } };
  if (state === "noapproval") return { ...base, approvalRequired: false, gates: [featureGate("product", "draft")], permissions: { ...base.permissions, submit: [], advance: true } };
  if (state === "generated") return { ...base, specStage: "generated", pendingGates: [], gates: [featureGate("product", "approved"), featureGate("arch", "approved"), featureGate("tech", "draft", true), featureGate("qa", "draft", true)],
    skippedAreas: ["design"], permissions: { ...base.permissions, edit: ["product", "arch"], submit: ["tech", "qa"] } };
  if (state === "changes") return { ...base, gates: [featureGate("product", "draft")] };
  // FTR.HMR.DEV-0003: the mockup on the gate design, the block of arch, the links of the feature in work
  if (state === "dev3") return { ...base, specStage: "arch", gates: [featureGate("product", "approved"), featureGate("design", "draft"), featureGate("arch", "draft")],
    permissions: { ...base.permissions, edit: ["design", "arch"], submit: ["design", "arch"] } };
  // FTR.HMR.DEV-0004 R1, R2: the stage «Code generation» — a failed task and a task with its PR
  if (state === "codegen") return { ...base, phase: "codegen", specStage: "done", pendingGates: [], services: ["booking", "pricing"],
    gates: ["product", "design", "arch", "tech", "qa"].map((a) => featureGate(a, "approved")), permissions: { ...base.permissions, edit: [], submit: [], codegen: true, retry: true } };
  if (state === "running") return { ...base, gates: [featureGate("product", "draft")], writerRun: { mode: "write", state: "generating", areas: ["product"], waitingLock: false }, permissions: { ...base.permissions, edit: [], submit: [] } };
  return { ...base, gates: [featureGate("product", "draft")], openQuestions: { product: 2 } };
}
const specQuestion = (id, title, extra = {}) => ({ id, round: 1, title, body: "Discovery решает, что скидка есть, но не определяет этот порог.", options: ["За 1 час"], recommended: "за 2 часа до конца аренды",
  why: "Так видно эффект в пиковые часы.", audience: "product", canAnswer: true, ...extra });
function specQuestions(state) {
  if (state === "return") return { items: [{ area: "arch", round: 1, roundsLeft: 4, questions: [specQuestion("Q2", "Срок хранения журнала аудита", { audience: "product", touches: ["product"], canAnswer: false })] }] };
  if (state && state !== "questions") return { items: [] };
  return { items: [{ area: "product", round: 1, roundsLeft: 4, questions: [specQuestion("Q1", "Порог досрочного возврата"), specQuestion("Q2", "Скидка при продлении")] }] };
}
const featureDoc = { content: "# Продуктовая спецификация: Скидка за ранний возврат авто\n\n**R1.** Клиент, вернувший авто за 2 часа до конца аренды, получает скидку на следующую аренду (допущение, см. Q1).\n",
  sha: "s", fix: false, generated: false, warnings: [], unnumberedRequirements: [], lock: null, readOnly: false, files: [] };

// FTR.HMR.SPEC-0004: arch with a C4 diagram (mock-c4=read — the reading, edit — the text and the preview,
// error — a block that does not parse) and the contracts of tech
const c4Arch = (block) => "# Архитектура: Скидка за ранний возврат авто\n\n## Затрагиваемые сервисы и контракты\n\n| Сервис | Роль в фиче | Меняющиеся контракты |\n|---|---|---|\n" +
  "| `booking` | Бронь и возврат | `POST /bookings/{id}/return` |\n| `pricing` | Скидка | `GET /discounts` |\n\n## Схема C4\n\n```mermaid\n" + block + "\n```\n\n## Принятые решения\n\n| A | Решение | Обоснование |\n|---|---|---|\n| A1 | Скидка считается в pricing | Цены в одном месте |\n";
const c4Block = "C4Container\n  Person(client, \"Клиент\")\n  System_Boundary(rent, \"Аренда\") {\n    Container(booking, \"Бронь\", \"Go\", \"Брони и возвраты\")\n" +
  "    Container(pricing, \"Цены\", \"Go\", \"Тарифы и скидки\")\n  }\n  System_Ext(pay, \"Платёжный шлюз\")\n  Rel(client, booking, \"возвращает авто\", \"HTTPS\")\n" +
  "  Rel(booking, pricing, \"скидка\", \"gRPC\")\n  Rel(pricing, pay, \"возврат разницы\", \"HTTPS\")";
const contractYAML = "openapi: 3.0.3\ninfo:\n  title: booking — возврат авто\n  version: \"1.0\"\n  description: Контракт возврата `booking` (FTR.FMS.CAR-0005 R1).\ntags:\n  - name: returns\n    description: Возврат и скидка\npaths:\n  /bookings/{id}:\n    get:\n      tags: [returns]\n      summary: Бронь\n      responses:\n        \"404\": { description: Брони нет }\n  /bookings/{id}/return:\n    post:\n      tags: [returns]\n      summary: Вернуть авто\n" +
  "      parameters:\n        - { name: id, in: path, required: true, schema: { type: string } }\n      responses:\n        \"200\":\n          description: Возврат принят\n          content:\n            application/json:\n              schema: { $ref: \"#/components/schemas/Return\" }\n" +
  "components:\n  schemas:\n    Return:\n      type: object\n      properties:\n        discount: { type: number, description: Скидка на следующую аренду }\n";
const contractProto = "syntax = \"proto3\";\n\npackage pricing.v1;\n\n// The discount for an early return.\nservice Discounts {\n  rpc Quote(QuoteRequest) returns (Quote);\n}\n\nmessage QuoteRequest {\n  string booking_id = 1;\n  int64 returned_at = 2;\n}\n\nmessage Quote {\n  double discount = 1;\n  repeated string reasons = 2;\n}\n\nenum Reason {\n  REASON_UNSPECIFIED = 0;\n  EARLY_RETURN = 1;\n}\n";

// FTR.HMR.DEV-0004 R4–R11: the cost of the feature and the log of a run
const tk = (i, o, r, w) => ({ in: i, out: o, cacheRead: r, cacheWrite: w });
const costRun = (id, at, reason, costUsd, tokens, extra = {}) => ({ id, runId: "run-" + id, at: T(at), reason, status: "succeeded", model: "sonnet-5",
  costUsd, costKnown: costUsd !== null, tokens, logAvailable: true, ...extra });
const costItems = {
  research: { kind: "research", key: null, costUsd: 0.4, unknownRuns: 0, runs: 1, running: 0, tokens: tk(30000, 4000, 200000, 8000), list: [
    costRun("r1", "02:10", null, 0.4, tk(30000, 4000, 200000, 8000)),
  ] },
  "area:tech": { kind: "area", key: "tech", costUsd: 4.12, unknownRuns: 1, runs: 4, running: 0, tokens: tk(214880, 61402, 3090115, 40220), list: [
    costRun("w4", "06:09", "regenerate", 1.5, tk(60000, 18000, 900000, 12000), { shared: { areas: ["tech", "qa"], costUsd: 3, tokens: tk(120000, 36000, 1800000, 24000) } }),
    costRun("w3", "05:00", "request", null, tk(40000, 9000, 0, 0), { model: "gigachat-max" }),
    costRun("w2", "04:52", "regenerate", 1.4, tk(70000, 20000, 1100000, 16000)),
    costRun("w1", "03:30", "generate", 1.22, tk(45000, 14000, 1000000, 12000), { logAvailable: false }),
  ] },
  "service:booking": { kind: "service", key: "booking", costUsd: 41.2, unknownRuns: 0, runs: 2, running: 0, tokens: tk(1942117, 486310, 78103552, 812044), list: [
    costRun("t1b", "08:10", "retry", 6.02, tk(300000, 52000, 8100000, 100000)),
    costRun("t1", "06:38", "first", 35.18, tk(1600000, 434000, 70000000, 700000), { status: "failed" }),
  ] },
  "service:pricing": { kind: "service", key: "pricing", costUsd: 11.85, unknownRuns: 0, runs: 1, running: 0, tokens: tk(320000, 90000, 19900000, 13000) },
};
const featureCost = (detail) => {
  const items = Object.entries(costItems).map(([k, it]) => (k === detail ? it : { ...it, list: undefined }));
  return { total: { costUsd: 57.57, unknownRuns: 1, runs: 8, running: 0, tokens: tk(2507000, 641712, 101293667, 873264) }, items, canViewLog: true };
};
const runLog = [
  ["entry", "2", { id: "m1", kind: "message", at: T("06:38"), text: "Читаю спецификацию и код `booking`: миграции, `internal/returns`." }],
  ["entry", "3", { id: "ta", kind: "tool", at: T("06:39"), tool: "bash", command: "cd /work && ls migrations/", result: "0001_init.sql … 0018_discounts.sql" }],
  ["entry", "4", { id: "tb", kind: "tool", at: T("06:52"), tool: "bash", command: "curl -sI https://proxy.golang.org/github.com/klauspost/compress/@v/v1.19.2.zip", isError: true, result: "bash: curl: command not found\nexit 127" }],
  ["entry", "5", { id: "tc", kind: "tool", at: T("06:53"), tool: "mcp__hammurapi__spec_read", args: { featureKey: "FTR.FMS.CAR-0005", area: "design" }, result: "в работе · из ветки feature/FTR.FMS.CAR-0005" }],
  // the arguments as the text of JSON, as Nabu passes them after masking (design §3.4: by field, with line breaks)
  ["entry", "5.1", { id: "td", kind: "tool", at: T("07:02"), tool: "write",
    args: JSON.stringify({ path: "migrations/0019_returns.sql", content: "-- +goose Up\nALTER TABLE returns ADD COLUMN returned_at TIMESTAMPTZ;\n\n-- +goose Down\nALTER TABLE returns DROP COLUMN returned_at;" }),
    result: "wrote 4 lines" }],
  ["entry", "6", { id: "c6", kind: "check", at: T("07:20"), status: "finished", data: { command: "go test ./...", status: "passed" } }],
  ["entry", "7", { id: "done", kind: "done", at: T("07:34"), data: { status: "failed", usage: { costUsd: 35.18 } } }],
  ["entry", "7.1", { id: "s1", kind: "step", at: T("07:34"), step: "branch", status: "ok", detail: "created hammurapi/FTR.FMS.CAR-0005/booking" }],
  ["entry", "7.2", { id: "s2", kind: "step", at: T("07:34"), step: "commit", status: "failed", detail: "commit to hammurapi/FTR.FMS.CAR-0005/booking: create the tree: git provider: not found (HTTP 404)" }],
];

// FTR.HMR.DEV-0004 R1–R3: the services of a feature in code generation
const codeTask = (id, service, status, extra = {}) => ({ id, type: "implement", status, service, result: null, progress: null, error: null, tokensIn: 0, tokensOut: 0,
  createdAt: "2026-11-11T06:38:00Z", startedAt: "2026-11-11T06:38:00Z", finishedAt: "2026-11-11T07:34:00Z", errorClass: null, nabuRunId: "run-" + id, ...extra });
const implementation = { phase: "codegen", workflow: { state: "blocked", step: "codegen", lastError: "the task for booking failed" }, matrix: [
    { id: "R1", text: "Возврат авто с отметкой времени", services: ["booking"], prs: [],
      testCases: [{ id: "RET-01", level: "I", title: "Возврат", services: ["booking"] }, { id: "UI-01", level: "E", title: "Экран возврата", services: [] }] },
    { id: "R2", text: "Скидка на следующую аренду", services: ["pricing"], prs: [],
      testCases: [{ id: "DSC-01", level: "U", title: "Расчёт скидки", services: ["pricing"] }, { id: "CTR-01", level: "I", title: "Контракт", services: ["booking", "pricing"] }] },
    // a long list of cases wraps inside the matrix (DEV-0004 design §1)
    { id: "R3", text: "Отчёт по возвратам с разрезом по филиалам", services: ["booking", "pricing"],
      prs: [{ service: "booking", number: 15, url: "https://github.com/GreenOnGrey/booking/pull/15" }],
      testCases: Array.from({ length: 18 }, (_, i) => ({ id: `AGG-${String(i + 1).padStart(2, "0")}`, level: "U", title: "Агрегат", services: [] })) },
  ], humanPrs: [], tokensIn: 93177574, tokensOut: 0, canStart: false,
  services: [
    { service: "booking", repo: "GreenOnGrey/booking", autonomy: "pr", check: { command: "go test ./...", timeoutSec: 600 }, pr: null, plan: null,
      tasks: [codeTask("t1", "booking", "failed", { tokensIn: 72854239, errorClass: "git", retry: "commit",
        error: "commit to hammurapi/FTR.FMS.CAR-0005/booking: create the tree: git provider: not found (HTTP 404)",
        result: { check: { status: "passed", command: "go test ./...", attempts: 1, maxAttempts: 3, outputTail: "" } } }),
        // an earlier run of the service: the log has a switcher of runs (qa LOG-24)
        codeTask("t0", "booking", "failed", { createdAt: "2026-11-10T09:10:00Z", startedAt: "2026-11-10T09:10:00Z", finishedAt: "2026-11-10T09:40:00Z",
          errorClass: "agent", error: "the agent made no changes" })] },
    { service: "pricing", repo: "GreenOnGrey/pricing", autonomy: "pr", check: { command: "npm test", timeoutSec: 600 }, plan: null,
      tasks: [codeTask("t2", "pricing", "succeeded", { tokensIn: 20323335, result: { prNumber: 15, check: { status: "passed", command: "npm test", attempts: 1, maxAttempts: 3, outputTail: "" } } })],
      // FTR.HMR.DEV-0004 qa PCI-08: a repository without checks — «CI: нет проверок»
      pr: { id: "pr15", repo: "GreenOnGrey/pricing", number: 15, url: "http://pr/15", title: "FTR.FMS.CAR-0005 pricing: Скидка за ранний возврат авто", branch: "hammurapi/FTR.FMS.CAR-0005/pricing",
        kind: "service", service: "pricing", byAgent: true, state: "open", review: "required", headSha: "h", ciStatus: "none", mergeSha: null, mergedAt: null, requirements: [], createdAt: "2026-11-11T06:56:00Z" } },
  ] };

function api(url, c) {
  const p = url.pathname;
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/gates/tech/files") return c("mock-feature") !== "generated" ? { ref: "ftr", files: [] } : { ref: "ftr", files: [
    { name: "booking.openapi.yaml", size: 900, mimeType: "application/vnd.oai.openapi", blobSha: "c1", previewable: true },
    { name: "pricing.proto", size: 420, mimeType: "text/x-protobuf", blobSha: "c2", previewable: true },
  ] };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/gates/tech/files/raw") return { text: url.searchParams.get("name") === "pricing.proto" ? contractProto : contractYAML };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/gates/arch/document" && c("mock-c4")) return { ...featureDoc, readOnly: c("mock-c4") === "read",
    content: c4Arch(c("mock-c4") === "error" ? c4Block.replace("Rel(client, booking", "Rel(client, bookng").replace('"Клиент")', '"Клиент)') : c4Block) };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005") return { ...feature(c("mock-feature")) };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/implementation") return implementation;
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/cost") return featureCost(url.searchParams.get("detail"));
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/discovery") return !c("mock-discovery") ? { ref: "ftr", document: null, files: [] } : { ref: "ftr",
    document: { path: "specs/FMS/CAR/FTR.FMS.CAR-0005/discovery/discovery.md", markdown: discoveryMd, blobSha: "d0" }, files: discoveryFiles };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/spec/questions") return specQuestions(c("mock-feature"));
  // FTR.HMR.DEV-0002 R7: the block of changes with every state
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/spec/changes" && url.searchParams.get("area") !== "arch") return c("mock-feature") !== "changes" ? { items: [] } : { items: [
    { feature: "FTR.FMS.CAR-0002", requirement: "R13", note: "Отмена платная после 10 минут.", state: "marked", url: "/spec/FTR.FMS.CAR-0002/product#r13" },
    { feature: "FTR.FMS.CAR-0001", requirement: null, note: "Новая страница тарифов.", state: "pending", url: "/spec/FTR.FMS.CAR-0001/product" },
    { feature: "FTR.FMS.CAR-0002", requirement: "R99", note: "Возврат на карту.", state: "error", url: "/spec/FTR.FMS.CAR-0002/product#r99",
      error: { feature: "FTR.FMS.CAR-0002", requirement: "R99", reason: "unknown_requirement" } },
  ] };
  // FTR.HMR.DEV-0003 R1, R6, R8, R16
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/gates/design/files") return c("mock-feature") !== "dev3" ? { ref: "ftr", files: [] } : { ref: "ftr", files: [
    { name: "flow.html", size: 9_000, mimeType: "text/html", blobSha: "b2", previewable: true, viewUrl: "/api/v1/features/FTR.FMS.CAR-0005/gates/design/files/raw?mode=view&name=flow.html&v=b2" },
    { name: "mockups.html", size: 48_000, mimeType: "text/html", blobSha: "b1", previewable: true, viewUrl: "/api/v1/features/FTR.FMS.CAR-0005/gates/design/files/raw?mode=view&name=mockups.html&v=b1" },
  ] };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/spec/links") return c("mock-feature") !== "dev3" ? { layers: [] } : { layers: [
    { layer: "product", state: "approved", extends: [{ key: "FTR.FMS.CAR-0001", title: "Каталог машин", indexed: true, items: [] }],
      changes: [{ key: "FTR.FMS.CAR-0002", title: "Бронь", indexed: true, items: ["R13"] }] },
    { layer: "arch", state: "draft", extends: [{ key: "FTR.FMS.CAR-0002", title: "Бронь", indexed: true, items: ["A1"] }, { key: "FTR.FMS.CAR-0009", title: null, indexed: false, items: [] }],
      changes: [{ key: "FTR.FMS.CAR-0002", title: "Бронь", indexed: true, items: ["A2"] }] },
  ] };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/spec/changes" && url.searchParams.get("area") === "arch") return c("mock-feature") !== "dev3" ? { items: [] } : { items: [
    { feature: "FTR.FMS.CAR-0002", item: "A2", kind: "decision", requirement: "A2", note: "Отмена — команда сервису тарифов, а не событие.", state: "marked", url: "/spec/FTR.FMS.CAR-0002/arch#a2" },
    { feature: "FTR.FMS.CAR-0002", item: "R13", kind: "decision", requirement: "R13", note: "Требование в arch.", state: "error", url: "/spec/FTR.FMS.CAR-0002/arch#r13",
      error: { feature: "FTR.FMS.CAR-0002", requirement: "R13", reason: "wrong_kind" } },
  ] };
  if (p === "/api/v1/spec/items/FTR.FMS.CAR-0002/A2") return { key: "FTR.FMS.CAR-0002", item: "A2", kind: "decision", url: "/spec/FTR.FMS.CAR-0002/arch#a2",
    markdown: "| A | Решение | Обоснование |\n|---|---|---|\n| A2 | Отмена — событие Kafka | Подписчики узнают об отмене сами |" };
  if (p === "/admin/api/v1/rules/product") return { area: "product", canChange: true, files: [
    { file: "template", path: "rules/product/template.md", sha: "t1", content: "# Продуктовая спецификация: <название фичи>\n\n**Опирается на:** <ключи>\n\n## Требования\n\n**R1.** <Требование>\n\n## Изменения в других решениях\n\n| Решение | Требование | Что изменилось |\n|---|---|---|\n" },
    { file: "fix-template", path: "rules/product/fix-template.md", sha: "t2", content: "---\nparent: FTR.FMS.CAR-0000\n---\n\n# Исправление\n" },
  ] };
  if (p === "/admin/api/v1/rules/product/contract") return { lang: "ru", alsoRead: ["en"], fixTemplate: [], template: [
    { element: "depends_on", title: "Строка «Опирается на»", example: "**Опирается на:** `FTR.HMR.CMN-0001` (R3)" },
    { element: "requirement", title: "Требования R<n> с критериями «Дано»", example: "**R1.** …\n- Дано …" },
    { element: "changes_section", title: "Раздел «Изменения в других решениях»", example: "## Изменения в других решениях\n| Решение | Требование | Что изменилось |" },
  ] };
  if (p === "/admin/api/v1/rules/violations") return { items: c("mock-rules") !== "broken" ? [] : [
    { area: "arch", file: "template", sha: "a1", violations: [{ element: "decisions", message: "the table of decisions has no column A<n>" }] },
  ] };
  if (p === "/api/v1/features/FTR.FMS.CAR-0005/topic") return { conversationId: null, title: "FTR.FMS.CAR-0005 — Скидка за ранний возврат авто" };
  if (/^\/api\/v1\/features\/FTR\.FMS\.CAR-0005\/gates\/\w+\/document$/.test(p)) return featureDoc;
  if (p === "/api/v1/config") return config(c("mock-login"));
  if (p === "/api/v1/auth/me") return me(c("mock-theme") ?? "light");
  if (p === "/api/v1/profile") return profile(c("mock-theme") ?? "light");
  if (p === "/api/v1/domains") return domains;
  // FTR.HMR.SPEC-0002: the service card with the check in CI; mock-ci=1
  if (p === "/api/v1/services") return c("mock-ci") ? [{ key: "booking", name: "Booking", system: "NAB/CMN", domain: "NAB", repo: "fleet/booking", ownerRef: "user:ada",
    owners: ["ada"], autonomy: "pr", deployOverride: null, overrideFromCatalog: false, source: "manual", catalogRef: null, deletedInCatalog: false, check: null }] : [];
  if (p === "/api/v1/ci-checks/services/booking") return { status: "proposed", version: null, contractVersion: "1.1.0", path: ".github/workflows/speclint.yml", repo: "fleet/booking",
    pr: { number: 12, url: "http://pr/12", kind: "propose" }, error: null, checkedAt: T("09:00", "05") };
  // FTR.HMR.SPEC-0003: the installation token, not issued
  if (p === "/api/v1/ci-token") return { issued: false, prefix: null, createdAt: null, createdBy: null, lastUsedAt: null };
  if (p === "/api/v1/ci-checks/spec") return { status: "outdated", version: "1.0.1", contractVersion: "1.1.0", path: ".github/workflows/speclint.yml", repo: "org/specs",
    pr: { number: 41, url: "http://pr/41", kind: "bump" }, error: null, checkedAt: T("09:00", "05") };
  if (p === "/admin/api/v1/settings") return { attachmentRetentionDays: 90 };
  if (p === "/admin/api/v1/spec-scan/settings") return { interval: "1h", branch: "main" };
  if (p === "/admin/api/v1/spec-scan/runs") return { items: [{ id: "r1", trigger: "schedule", status: "succeeded", startedAt: T("09:00", "05"), finishedAt: T("09:00", "05"),
    durationMs: 1800, found: 63, indexed: 63, issues: 0, error: null }], nextCursor: null };
  if (p === "/admin/api/v1/spec-scan/issues") return { items: [] };
  if (p === "/api/v1/focus") return focus;
  if (p === "/api/v1/overview") return overview;
  if (p === "/api/v1/issues") return { items: issues, nextCursor: null };
  if (p === "/api/v1/releases") return { items: releases, nextCursor: null };
  if (/^\/api\/v1\/issues\/[^/]+$/.test(p)) return issueCard;
  if (/^\/api\/v1\/issues\/[^/]+\/discovery$/.test(p)) return discovery;
  if (p === "/api/v1/agent") return nabuAgent;
  if (p === "/admin/api/v1/nabu") return nabuAdmin(c("mock-nabu"));
  if (p === "/api/v1/spec/tree") return specTree;
  if (p === "/api/v1/spec/graph") return graphOf(url.searchParams.get("layer"));
  let m = /^\/api\/v1\/spec\/documents\/([^/]+)\/([^/]+)$/.exec(p);
  if (m && c("mock-discovery")) {
    const d = specDoc(decodeURIComponent(m[1]), m[2]);
    const areas = ["discovery", ...d.areas];
    return m[2] !== "discovery" ? { ...d, areas } : { ...d, areas, path: `specs/NAB/CMN/${d.featureKey}/discovery/discovery.md`, title: d.feature.title,
      markdown: discoveryMd, toc: [{ level: 2, text: "Проблема", slug: "problema" }, { level: 2, text: "Риски", slug: "riski" }] };
  }
  if (m) {
    const d = specDoc(decodeURIComponent(m[1]), m[2]);
    return c("mock-links") ? { ...d, feature: { ...d.feature, links: specLinks } } : d;
  }
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
  //   /__frame?p=/overview&w=390&h=844&theme=dark&auth=0&login=oidc
  if (url.pathname === "/__frame") {
    const q = url.searchParams;
    const theme = q.get("theme") ?? "light";
    const set = [["mock-theme", theme], ["mock-auth", q.get("auth") ?? "1"], ["mock-login", q.get("login") ?? "github"]];
    res.writeHead(200, { "content-type": "text/html", "set-cookie": set.map(([k, v]) => `${k}=${v}; Path=/`) });
    return res.end(`<!doctype html><body style="margin:0;background:#888"><script>try{localStorage.setItem("hmr-theme","${theme}")}catch(e){}</script><iframe src="${q.get("p") ?? "/"}" width="${q.get("w") ?? 1280}" height="${q.get("h") ?? 860}" style="border:0;display:block"></iframe></body>`);
  }
  if (url.pathname === "/config.json") { res.writeHead(404); return res.end(); }
  // FTR.HMR.DEV-0004 R8: the log of a run — the entries at once, then the stream ends
  if (/^\/api\/v1\/features\/[^/]+\/runs\/[^/]+\/log$/.test(url.pathname)) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    return res.end("retry: 600000\n\n" + runLog.map(([ev, id, d]) => `id: ${id}\nevent: ${ev}\ndata: ${JSON.stringify(d)}\n\n`).join(""));
  }
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
    // FTR.HMR.CMN-0007 R26: the files of a message
    if (url.pathname === "/api/v1/chat/attachments/f1") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end("Требование,Покрыто\nR17,нет\nR23,нет\n");
    }
    if (url.pathname === "/api/v1/chat/attachments/f2/preview") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ sheets: [{ name: "Покрытие", rows: 2, cols: 2, cells: [[{ v: "Требование" }, { v: "Покрыто" }], [{ v: "R17" }, { v: "нет" }]], merges: [], freeze: "" }] }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(api(url, cookie)));
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => console.log(`mock ${DIST} on ${PORT}`));
