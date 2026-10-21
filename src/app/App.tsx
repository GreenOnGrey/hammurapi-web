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
        qc.invalidateQueries({ queryKey: keys.requirements(d.uniqueId) });
        qc.invalidateQueries({ queryKey: keys.features() });
        qc.invalidateQueries({ queryKey: keys.focus });
      }),
      onEvent("feature.deleted", () => invalidateCycle(qc)),
      onEvent("issue.updated", () => invalidateCycle(qc)),
      onEvent("discovery.progress", (d: { key: string }) =>
        qc.invalidateQueries({ queryKey: keys.discovery(d.key) }),
      ),
      onEvent("feature.updated", () => invalidateCycle(qc)),
      onEvent("task.progress", () =>
        qc.invalidateQueries({ queryKey: ["implementation"] }),
      ),
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
