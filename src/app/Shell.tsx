import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { ChatPanel } from "../chat/ChatPanel";
import { NabuChatPanel, NoAgentPanel, useNabuAgent } from "../chat/NabuChat";
import { GitLinkDialog } from "./GitLink";
import { NewIssueModal } from "../pages/NewIssue";
import { ProfileMenu } from "./ProfileMenu";
import { useChatContext, useSession } from "./session";

// Stages of the cycle are the navigation (FTR.HMR.CMN-0002 R36): General,
// Discovery, Development, Delivery (FTR.HMR.CMN-0003); the main action is "New issue".
export const STAGES = [
  { to: "/", key: "general", match: ["/", "/overview"] },
  // FTR.HMR.CMN-0005 R11: the specification comes first among the stages of the cycle.
  { to: "/spec", key: "spec", match: ["/spec"] },
  { to: "/research", key: "research", match: ["/research", "/issues"] },
  {
    to: "/development",
    key: "development",
    match: ["/development", "/features", "/imports"],
  },
  { to: "/delivery", key: "delivery", match: ["/delivery", "/releases"] },
] as const;

export function stageOf(path: string): string {
  for (const s of STAGES.slice(1))
    if (s.match.some((m) => path.startsWith(m))) return s.key;
  return path.startsWith("/admin") ? "" : "general";
}

export function Shell() {
  const { t } = useTranslation();
  const { me, profile, config } = useSession();
  // FTR.HMR.CMN-0006: the chat of the agent in Nabu, the built-in agent until
  // the transfer, or no agent at all (R9).
  const agentKind = !config.agent ? "builtin" : !config.agent.enabled ? "none" : (config.agent.provider ?? "builtin");
  const chat = useChatContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const current = stageOf(location.pathname);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (v.startsWith("ISS.")) navigate(`/issues/${v}`);
    else if (v.startsWith("FTR.")) navigate(`/features/${v}`);
    else if (v.startsWith("RLS.")) navigate(`/releases/${v}`);
    else
      navigate(`/development?q=${encodeURIComponent(v)}&domain=all&status=all`);
  };

  const stageLinks = STAGES.map((s) => (
    <NavLink
      key={s.key}
      to={s.to}
      end={s.to === "/"}
      className={current === s.key ? "on" : undefined}
    >
      {t(`stages.${s.key}`)}
    </NavLink>
  ));

  return (
    <div className="app">
      <div className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" />
          <span className="hide-m">Hammurapi</span>
        </Link>
        <nav className="nav hide-m" aria-label={t("stages.title")}>
          {stageLinks}
        </nav>
        <form className="search" role="search" onSubmit={submitSearch}>
          <Icon name="search" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("top.search")}
            aria-label={t("top.search")}
          />
        </form>
        <div className="top-actions">
          <button className="btn primary sm" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            <span className="hide-m">{t("top.newIssue")}</span>
          </button>
          <button
            className="avatar"
            style={menu ? { boxShadow: "0 0 0 2px var(--violet)" } : undefined}
            onClick={() => setMenu((v) => !v)}
            aria-label={t("profile.title")}
            aria-expanded={menu}
          >
            <Avatar name={me.displayName} url={me.avatarUrl} />
          </button>
        </div>
        {menu && <ProfileMenu onClose={() => setMenu(false)} />}
      </div>
      <div className="body">
        <Outlet />
        {agentKind === "nabu" ? <NabuChatPanel /> : agentKind === "none" ? <NoAgentPanel /> : <ChatPanel />}
      </div>
      <nav className="bnav show-m" aria-label={t("stages.title")}>
        {stageLinks}
      </nav>
      {!chat.open && (
        <button
          className="btn primary chat-fab"
          onClick={() => chat.setOpen(true)}
        >
          <Icon name="msg" />
          {agentKind === "nabu" ? <NabuName /> : agentKind === "none" ? t("noAgent.title") : profile.agentName}
        </button>
      )}
      <GitLinkDialog />
      {creating && <NewIssueModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NabuName() {
  const agent = useNabuAgent();
  return <>{agent.data?.name ?? "Nabu"}</>;
}
