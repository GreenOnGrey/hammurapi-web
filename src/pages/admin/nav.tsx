import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@green-on-grey/ui-kit";
import { useSession } from "../../app/session";
import { useNabuSettings } from "./nabuSettings";
import { adminPath, type AdminSection } from "./paths";

// The sections of the administration (product spec §17): users, the cycle,
// deploy, metrics, settings, Nabu and the agent — global admin; domains,
// services and rules — any admin.
const SECTIONS: { path: AdminSection; icon: IconName; global?: boolean; nabu?: boolean }[] = [
  { path: "users", icon: "users", global: true },
  { path: "domains", icon: "grid" },
  { path: "services", icon: "server" },
  { path: "rules", icon: "book" },
  { path: "cycle", icon: "refresh", global: true },
  { path: "deploy", icon: "rocket", global: true },
  { path: "metrics", icon: "target", global: true },
  { path: "settings", icon: "wrench", global: true },
  { path: "nabu", icon: "link", global: true, nabu: true },
];

/** The navigation of the administration: the side panel of a desktop (`inBurger` hides it on a phone) and the
 * burger of a phone (`onPick` closes it, FTR.NAB.CMN-0005 design §4). Apart from the lazy panel: the top bar shows
 * it without loading the administration. */
export function AdminNav({ inBurger, onPick }: { inBurger?: boolean; onPick?: () => void }) {
  const { t } = useTranslation();
  const { me, config } = useSession();
  // FTR.HMR.CMN-0006 R10, R11: with Nabu the Agent section is replaced by the
  // Nabu section once the settings are transferred; usage stays for reports.
  const nabu = config.agent?.provider === "nabu";
  const nabuSettings = useNabuSettings(nabu && me.globalAdmin);
  const legacyAgent = !nabu ? config.agent?.enabled !== false : !nabuSettings.data?.migrated;
  // The Agent group is open on its own pages; a click folds or unfolds it.
  const onAgent = useLocation().pathname.startsWith("/admin/agent/");
  const [toggled, setToggled] = useState<boolean | null>(null);
  const agentOpen = toggled ?? onAgent;
  const global = me.globalAdmin;
  const agentPages: AdminSection[] = [...(legacyAgent ? ["agent/connections", "agent/models", "agent/skills", "agent/mcp"] as const : []), "agent/usage"];
  return (
    <nav className={inBurger ? "side in-burger" : "side"} aria-label={t("admin.title")}>
      <div className="lab">{t("admin.title")}</div>
      {SECTIONS.filter((s) => (!s.global || global) && (!s.nabu || nabu)).map((s) => (
        <NavLink key={s.path} to={adminPath(s.path)} onClick={onPick}>
          <Icon name={s.icon} />
          {t(`admin.${s.path}.title`)}
        </NavLink>
      ))}
      {global && (
        <>
          <button type="button" className="sidegroup" aria-expanded={agentOpen} onClick={() => setToggled(!agentOpen)}>
            <Icon name="cpu" />
            {t("admin.agent.title")}
            <span className={`chev${agentOpen ? " open" : ""}`} aria-hidden>›</span>
          </button>
          {agentOpen && agentPages.map((p) => (
            <NavLink key={p} className="sub" to={adminPath(p)} onClick={onPick}>
              {t(`admin.${p.replace("/", ".")}.title`)}
            </NavLink>
          ))}
        </>
      )}
    </nav>
  );
}
