# AGENTS.md — hammurapi-web

Guide for coding agents and developers working in this repository.

## Workspace

Hammurapi is five repositories checked out side by side: `hammurapi-core` (Go backend),
`hammurapi-web` (this SPA), `hammurapi` (public docs, demo stack, reusable deploy workflow),
`hammurapi-infra` (private stand and charts) and `hammurapi-specs` (the specifications).

- Every change implements a feature specification from
  `hammurapi-specs/specs/HMR/CMN/FTR.HMR.CMN-NNNN/`; the design spec and `design/mockups.html` define
  the screens. Refer to specs in comments as `FTR.HMR.CMN-0005 R11` (old forms `PLT.HMR-…`,
  bare `HMR.CMN-…` are obsolete).
- Deviations from a spec are written into the spec in the same piece of work.
- Do not commit, tag or push unless asked.

## Stack

React 19, TypeScript, Vite, TanStack Query, React Router 7, i18next with ICU, Milkdown (the editor,
also the read-only renderer of specification documents). Node 24.

```sh
npm ci
npm run dev        # http://localhost:5173; /api and /admin/api go to localhost:8080
npm test           # vitest
npm run lint       # oxlint + tsc + ui-kit-check (warnings are tolerated, errors are not)
UI_KIT_SRC=../ui-kit npm run dev   # with the kit from its sources, to try a change of the kit
npm run build      # typecheck + production build
```

CI runs lint, tests, `deploy/sync-ref.sh --check` and actionlint.

## Layout

```text
src/api/          client (fetch, CSRF, ApiError), types.ts (mirrors core JSON), queries.ts (query keys)
src/app/          App (routes, SSE invalidation), Shell (top bar, stages), session
src/pages/        pages; admin/ — Administration (paths.ts holds absolute section paths)
src/chat/         chat panel: ChatPanel (built-in agent), NabuChat (personal agent in Nabu, nabu.* events),
                  NoAgentPanel (Hammurapi without the agent; config.agent decides)
src/editor/       Milkdown editor (MarkdownEditor; readOnly for the navigator)
src/lib/          sse, i18n, format, errors, llm
locales/*.json    en (default and fallback), ru, de, es, zh-CN
e2e/              the screen comparison: mock.mjs (a fixed API), screens.ts, screens.spec.ts (Playwright), compare.mjs
```

## Rules

- **Five locales, identical keys** (`src/lib/i18n.test.ts` checks it). Messages are ICU: plurals as
  `{count, plural, one {…} other {…}}` (Russian: one/few/many/other); no apostrophes and no
  `<…>` in text (ICU reads them as escapes and tags). "Discovery" appears only as the English stage
  name.
- **Types mirror the core JSON.** When the API changes, update `src/api/types.ts`; stable error codes
  map to `errors.<code>` translations.
- **Admin links are absolute** (`adminPath(...)`): relative links inside the `admin/*` splat route
  resolve against the whole URL.
- **Untrusted content never becomes markup**: search snippets come with `‹…›` marks and are rendered
  as text plus `<mark>`; repository HTML only in `<iframe sandbox="allow-scripts">` (no
  `allow-same-origin`) — from the `viewUrl` of the core, served with `CSP: sandbox allow-scripts`, so a new tab
  is an opaque origin too, or from `srcdoc` with an older core (FTR.HMR.SPEC-0001 arch §6); SVG only in `<img>`; files of the API domain are fetched with credentials and
  shown from object URLs (the API may be on another site than the SPA).
- **SSE events** are listed in `src/lib/sse.ts`; App invalidates query keys on them.
- Heavy pages (feature, admin, the specification navigator) are lazy-loaded.
- Segmented switches use `.seg` (one row, any number of options); the admin menu groups (Agent)
  fold and look like menu items.
- Check UI changes in a browser at desktop and phone width; unit tests do not cover layout.
- **Screens are compared when the look must not change, or must change only as listed** (a new version of the
  kit, a refactoring of styles): the `visual` workflow builds two commits, shoots every screen of `e2e/screens.ts` on
  the fixed API of `e2e/mock.mjs` and compares the shots with zero tolerance; with `report_only` it gives a report of
  pairs for a person to accept. A page at an exact width without Playwright: `node e2e/mock.mjs`, then
  `/__frame?p=/overview&w=390&theme=dark`.

## UI kit

The shared look — tokens, buttons, fields, tables, the top bar, sign-in, icons — comes from `@green-on-grey/ui-kit`
(FTR.NAB.CMN-0005); `src/styles.css` holds the screens of Hammurapi only. The look is the one of Nabu.

- **Take from the kit**: `Icon`, `Modal`, `useToast`, `Avatar`, `Switch`, `Empty`, `Loading`, `TopBar`, `Menu`, `Tabs`,
  `Markdown`; `LoginScreen` from `…/login`; `Chat`, `ChatLayout`, `ConversationList` from `…/chat`. `StatusBadge`, `AreaName` and `GitLabIcon` are
  Hammurapi's own. The showcase lists every class and state: <https://greenongrey.github.io/ui-kit/>.
- **Do not restyle the kit** (R23). A rule in `src/styles.css` styles a class of Hammurapi: `.actionbar .ab-grow`, never
  `.actionbar .grow`. `ui-kit-check` in `npm run lint` fails on a rule whose target is an element of the kit, on a rule
  without a class of Hammurapi and on a redefined token. Need another look — give the element a class of its own or
  change the kit.
- **A new shared element** goes to the kit when Nabu needs it too; a new icon goes to the kit at once.
- **The kit knows nothing of tones**: `src/chat/tones.ts` gives the icon and the colour of the avatar of the agent.
- **The version of the kit is exact** (no `^`); Dependabot proposes updates; `deploy/kit-lag.sh` stops a release that
  is more than one minor behind.
- **Both chats are the `Chat` of the kit** — the same component as on the site of Nabu. A panel keeps its header,
  the modes and the files; the data comes from an adapter: `src/chat/ownAdapter.ts` (the built-in agent, `agent.*`
  events) and `src/chat/nabuAdapter.ts` (the agent of Nabu, `nabu.*` events). An adapter turns answers and events into
  the types of the kit and gives the handlers; the component never calls the API. No handler — no control.

## Releases

A tag `vX.Y.Z` builds the image `ghcr.io/greenongrey/hammurapi-web` and deploys it through the
reusable `deploy-component.yml` of the `hammurapi` repo pinned by `DEPLOY_WORKFLOW_REF` in
`deploy/versions.env` (run `deploy/sync-ref.sh` after changing it). The container writes
`/config.json` with `API_BASE_URL` at start, so one image fits any domain.
