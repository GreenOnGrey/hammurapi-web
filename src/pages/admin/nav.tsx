import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@green-on-grey/ui-kit";
import { useSession } from "../../app/session";
import { adminPath, type AdminSection } from "./paths";

// The sections of the administration (product spec §17): users, the cycle,
// deploy, metrics, settings, Nabu and the usage of agents — global admin;
// domains, services and rules — any admin. The agent lives in Nabu
// (FTR.HMR.CMN-0007 R3): only its usage stays here.
const SECTIONS: { path: AdminSection; icon: IconName; global?: boolean }[] = [
  { path: "users", icon: "users", global: true },
  { path: "domains", icon: "grid" },
  { path: "services", icon: "server" },
  { path: "rules", icon: "book" },
  { path: "cycle", icon: "refresh", global: true },
  { path: "deploy", icon: "rocket", global: true },
  { path: "metrics", icon: "target", global: true },
  { path: "settings", icon: "wrench", global: true },
  { path: "nabu", icon: "link", global: true },
  { path: "agent/usage", icon: "cpu", global: true },
];

/** The navigation of the administration: the side panel of a desktop (`inBurger` hides it on a phone) and the
 * burger of a phone (`onPick` closes it, FTR.NAB.CMN-0005 design §4). Apart from the lazy panel: the top bar shows
 * it without loading the administration. */
export function AdminNav({ inBurger, onPick }: { inBurger?: boolean; onPick?: () => void }) {
  const { t } = useTranslation();
  const { me } = useSession();
  const global = me.globalAdmin;
  return (
    <nav className={inBurger ? "side in-burger" : "side"} aria-label={t("admin.title")}>
      <div className="lab">{t("admin.title")}</div>
      {SECTIONS.filter((s) => !s.global || global).map((s) => (
        <NavLink key={s.path} to={adminPath(s.path)} onClick={onPick}>
          <Icon name={s.icon} />
          {t(`admin.${s.path.replace("/", ".")}.title`)}
        </NavLink>
      ))}
    </nav>
  );
}
