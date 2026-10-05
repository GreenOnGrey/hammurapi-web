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
npm run lint       # oxlint + tsc (warnings are tolerated, errors are not)
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
  as text plus `<mark>`; repository HTML only in `<iframe sandbox="allow-scripts" srcdoc>` (no
  `allow-same-origin`); SVG only in `<img>`; files of the API domain are fetched with credentials and
  shown from object URLs (the API may be on another site than the SPA).
- **SSE events** are listed in `src/lib/sse.ts`; App invalidates query keys on them.
- Heavy pages (feature, admin, the specification navigator) are lazy-loaded.
- Segmented switches use `.seg` (one row, any number of options); the admin menu groups (Agent)
  fold and look like menu items.
- Check UI changes in a browser at desktop and phone width; tests do not cover layout.

## Releases

A tag `vX.Y.Z` builds the image `ghcr.io/greenongrey/hammurapi-web` and deploys it through the
reusable `deploy-component.yml` of the `hammurapi` repo pinned by `DEPLOY_WORKFLOW_REF` in
`deploy/versions.env` (run `deploy/sync-ref.sh` after changing it). The container writes
`/config.json` with `API_BASE_URL` at start, so one image fits any domain.
