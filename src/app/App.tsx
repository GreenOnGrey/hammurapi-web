import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import {
  invalidateCycle,
  keys,
  useConfig,
  useMe,
  useProfile,
} from "../api/queries";
import {
  connectEvents,
  disconnectEvents,
  onEvent,
  onReconnect,
} from "../lib/sse";
import { RESEARCH_ENDED, type IssueStatus } from "../api/types";
import { setDocumentLanguage } from "../lib/i18n";
import { Loading } from "@green-on-grey/ui-kit";
import { ChatProvider, SessionProvider } from "./session";
import { Shell } from "./Shell";
import { LoginPage } from "../pages/Login";
import { FocusPage, OverviewPage } from "../pages/General";
import { IssuesPage } from "../pages/Issues";
import { IssuePage } from "../pages/Issue";
import { DevelopmentPage } from "../pages/Development";
import { ReleasesPage } from "../pages/Releases";
import { ReleasePage } from "../pages/Release";
import { DiffPage } from "../pages/Diff";
import { ImportPage } from "../pages/Import";

// The editor (Milkdown) is heavy: load it only on screens that edit documents.
const FeaturePage = lazy(() =>
  import("../pages/Feature").then((m) => ({ default: m.FeaturePage })),
);
const AdminPage = lazy(() =>
  import("../pages/admin/Admin").then((m) => ({ default: m.AdminPage })),
);
// The navigator renders documents with the editor (Milkdown): loaded on demand.
const SpecPage = lazy(() =>
  import("../pages/Spec").then((m) => ({ default: m.SpecPage })),
);
// FTR.HMR.DEV-0002 R15: the graph and its layout (d3-force) are a chunk of their own.
const SpecGraphPage = lazy(() =>
  import("../pages/SpecGraph").then((m) => ({ default: m.SpecGraphPage })),
);

export function App() {
  const config = useConfig();
  const me = useMe();
  const location = useLocation();

  if (config.isLoading || me.isLoading) return <Loading />;
  const unauthenticated =
    me.error instanceof ApiError && me.error.status === 401;
  if (unauthenticated || location.pathname === "/login") {
    if (!unauthenticated && me.data) return <Navigate to="/" replace />;
    return config.data ? <LoginPage config={config.data} /> : <Loading />;
  }
  if (!me.data || !config.data) return <Loading />;
  return <Authenticated />;
}

function Authenticated() {
  const me = useMe();
  const config = useConfig();
  const profile = useProfile();
  const qc = useQueryClient();
  const { i18n } = useTranslation();

  // Interface language after sign-in comes from the profile.
  const lang = profile.data?.language;
  useEffect(() => {
    if (lang && i18n.language !== lang) {
      i18n.changeLanguage(lang);
      setDocumentLanguage(lang);
    }
  }, [lang, i18n]);

  const theme = profile.data?.theme;
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("hmr-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  // Server-sent events keep lists and cards fresh without reloads.
  useEffect(() => {
    connectEvents();
    const offs = [
      onEvent("approvals.changed", () => {
        qc.invalidateQueries({ queryKey: keys.approvals });
        qc.invalidateQueries({ queryKey: keys.focus });
      }),
      onEvent("gate.updated", (d: { uniqueId: string }) => {
        qc.invalidateQueries({ queryKey: keys.feature(d.uniqueId) });
        qc.invalidateQueries({ queryKey: ["history", d.uniqueId] });
        qc.invalidateQueries({ queryKey: ["diff", d.uniqueId] });
        qc.invalidateQueries({ queryKey: ["document", d.uniqueId] });
        qc.invalidateQueries({ queryKey: keys.specChanges(d.uniqueId) });
        qc.invalidateQueries({ queryKey: ["gate-files", d.uniqueId] }); // FTR.HMR.DEV-0003 R4
        qc.invalidateQueries({ queryKey: keys.featureDiscovery(d.uniqueId) }); // FTR.HMR.DISC-0001 R30
        qc.invalidateQueries({ queryKey: ["draft-links", d.uniqueId] }); // R6
        qc.invalidateQueries({ queryKey: keys.requirements(d.uniqueId) });
        qc.invalidateQueries({ queryKey: keys.features() });
        qc.invalidateQueries({ queryKey: keys.focus });
      }),
      onEvent("feature.deleted", () => invalidateCycle(qc)),
      onEvent("issue.updated", (d: { key: string; status: IssueStatus }) => {
        invalidateCycle(qc);
        // FTR.HMR.DISC-0001 R25: the research ended — the topic is archived, the chat shows a draft
        if (RESEARCH_ENDED.includes(d.status)) qc.invalidateQueries({ queryKey: keys.topic(d.key) });
      }),
      onEvent("discovery.progress", (d: { key: string }) =>
        qc.invalidateQueries({ queryKey: keys.discovery(d.key) }),
      ),
      onEvent("discovery.request.updated", (d: { id: string; issueKey: string }) => {
        qc.invalidateQueries({ queryKey: keys.discoveryRequest(d.id) });
        qc.invalidateQueries({ queryKey: keys.discovery(d.issueKey) });
      }),
      // FTR.HMR.DEV-0001: the instructions and the questions of the writer
      onEvent("spec.request.updated", (d: { id: string; featureKey: string }) => {
        qc.invalidateQueries({ queryKey: keys.specRequest(d.id) });
        qc.invalidateQueries({ queryKey: keys.feature(d.featureKey) });
      }),
      onEvent("spec.questions.updated", (d: { uniqueId: string }) => {
        qc.invalidateQueries({ queryKey: keys.specQuestions(d.uniqueId) });
        qc.invalidateQueries({ queryKey: keys.feature(d.uniqueId) });
      }),
      onEvent("feature.updated", (d: { uniqueId?: string; phase?: string }) => {
        invalidateCycle(qc);
        qc.invalidateQueries({ queryKey: ["feature-cost"] });
        // FTR.HMR.DEV-0001 R20: the specification ended — the topics are archived, a return starts a draft
        if (d.uniqueId && d.phase) qc.invalidateQueries({ queryKey: keys.topic(d.uniqueId) });
      }),
      onEvent("task.progress", () => {
        qc.invalidateQueries({ queryKey: ["implementation"] });
        qc.invalidateQueries({ queryKey: ["feature-cost"] }); // FTR.HMR.DEV-0004 R4: a run adds to the cost
      }),
      onEvent("task.step", () => qc.invalidateQueries({ queryKey: ["implementation"] })),
      onEvent("validation.updated", () => {
        qc.invalidateQueries({ queryKey: ["validation"] });
        qc.invalidateQueries({ queryKey: keys.focus });
      }),
      onEvent("release.updated", () => invalidateCycle(qc)),
      onEvent("release.blocked", () => invalidateCycle(qc)),
      onEvent("focus.changed", () => {
        qc.invalidateQueries({ queryKey: keys.focus });
        qc.invalidateQueries({ queryKey: keys.overview() });
        qc.invalidateQueries({ queryKey: ["admin", "spec-scan"] });
      }),
      // FTR.HMR.CMN-0005 R17: the navigator follows the default branch.
      onEvent("spec.index_updated", () =>
        qc.invalidateQueries({ queryKey: ["spec"] }),
      ),
      onReconnect(() => qc.invalidateQueries()),
    ];
    return () => {
      offs.forEach((off) => off());
      disconnectEvents();
    };
  }, [qc]);

  if (profile.isLoading) return <Loading />;
  if (!profile.data || !me.data || !config.data) return <Loading />;
  const feature = (
    <Suspense fallback={<Loading />}>
      <FeaturePage />
    </Suspense>
  );
  const spec = (
    <Suspense fallback={<Loading />}>
      <SpecPage />
    </Suspense>
  );
  return (
    <SessionProvider me={me.data} profile={profile.data} config={config.data}>
      <ChatProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<FocusPage />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="spec" element={spec} />
            <Route path="spec/graph" element={<Suspense fallback={<Loading />}><SpecGraphPage /></Suspense>} />
            <Route path="spec/:featureKey" element={spec} />
            <Route path="spec/:featureKey/:area" element={spec} />
            <Route path="research" element={<IssuesPage />} />
            <Route path="issues/:key" element={<IssuePage />} />
            <Route path="development" element={<DevelopmentPage />} />
            <Route path="features/:uniqueId" element={feature} />
            <Route path="features/:uniqueId/:tab" element={feature} />
            <Route path="features/:uniqueId/spec/:area" element={feature} />
            <Route
              path="features/:uniqueId/spec/:area/diff"
              element={<DiffPage />}
            />
            <Route path="delivery" element={<ReleasesPage />} />
            <Route path="releases/:key" element={<ReleasePage />} />
            <Route path="imports/:id" element={<ImportPage />} />
            <Route
              path="admin/*"
              element={
                <Suspense fallback={<Loading />}>
                  <AdminPage />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ChatProvider>
    </SessionProvider>
  );
}
