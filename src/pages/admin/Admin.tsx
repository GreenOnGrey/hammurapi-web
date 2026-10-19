import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../../app/session";
import { Empty } from "@green-on-grey/ui-kit";
import { UsersAdmin } from "./Users";
import { DomainsAdmin } from "./Domains";
import { RulesAdmin } from "./Rules";
import { SettingsAdmin } from "./Settings";
import { ServicesAdmin } from "./Services";
import { CycleAdmin } from "./Cycle";
import { DeployAdmin } from "./Deploy";
import { MetricSourcesAdmin } from "./MetricSources";
import {
  AgentConnectionsAdmin,
  AgentMCPAdmin,
  AgentModelsAdmin,
  AgentSkillsAdmin,
  AgentUsageAdmin,
} from "./Agent";
import { adminPath } from "./paths";
import { NabuAdmin } from "./Nabu";
import { AdminNav } from "./nav";

/** Section access (product spec §17): users and settings — global admin;
 * domains — any admin; rules — area admins (global admin reads); the agent
 * (FTR.HMR.CMN-0004) — global admin. */
export function AdminPage() {
  const { t } = useTranslation();
  const { me, config, isAnyAdmin } = useSession();
  const nabu = config.agent?.provider === "nabu";
  if (!isAnyAdmin) {
    return (
      <main className="main">
        <Empty icon="lock" title={t("admin.noAccess")} />
      </main>
    );
  }
  const global = me.globalAdmin;
  return (
    <div className="admin" style={{ overflow: "hidden" }}>
      {/* on a phone the sections are behind the burger of the top bar (Shell) */}
      <AdminNav inBurger />
      <main className="main">
        <Routes>
          <Route
            index
            element={
              <Navigate to={adminPath(global ? "users" : "domains")} replace />
            }
          />
          {global && <Route path="users" element={<UsersAdmin />} />}
          <Route path="domains" element={<DomainsAdmin />} />
          <Route path="services" element={<ServicesAdmin />} />
          <Route path="rules" element={<RulesAdmin />} />
          {global && <Route path="cycle" element={<CycleAdmin />} />}
          {global && <Route path="deploy" element={<DeployAdmin />} />}
          {global && <Route path="metrics" element={<MetricSourcesAdmin />} />}
          {global && <Route path="settings" element={<SettingsAdmin />} />}
          {global && nabu && <Route path="nabu" element={<NabuAdmin />} />}
          {global && (
            <Route
              path="agent/connections"
              element={<AgentConnectionsAdmin />}
            />
          )}
          {global && (
            <Route path="agent/models" element={<AgentModelsAdmin />} />
          )}
          {global && (
            <Route path="agent/skills" element={<AgentSkillsAdmin />} />
          )}
          {global && <Route path="agent/mcp" element={<AgentMCPAdmin />} />}
          {global && <Route path="agent/usage" element={<AgentUsageAdmin />} />}
          {/* Unknown or unavailable section — the first available one (not ".": in a
              splat route it resolves to the current URL itself). */}
          <Route
            path="*"
            element={
              <Navigate to={adminPath(global ? "users" : "domains")} replace />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
