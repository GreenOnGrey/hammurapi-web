import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, Icon, TopBar, type LinkComponent } from "@green-on-grey/ui-kit";
import { ChatPanel } from "../chat/ChatPanel";
import { NabuChatPanel, NoAgentPanel, useNabuAgent } from "../chat/NabuChat";
import { ChatRail } from "../chat/ChatRail";
import { GitLinkDialog } from "./GitLink";
import { NewIssueModal } from "../pages/NewIssue";
import { AdminNav } from "../pages/admin/nav";
import { isAdminPath } from "../pages/admin/paths";
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

/** The link of the router for the top bar of the kit (FTR.NAB.CMN-0005 arch §4.2). */
const RouterLink: LinkComponent = ({ href, ...rest }) => <Link to={href} {...rest} />;

const profileMenu = (close: () => void) => <ProfileMenu onClose={close} />;

// FTR.NAB.CMN-0005 design §4: in the administration the burger of a phone holds its sections
const adminNav = (close: () => void) => <AdminNav onPick={close} />;

// The top bar is the one of the kit (FTR.NAB.CMN-0005 R5, design §4): the stages
// in a row and behind the burger on a phone — the bottom navigation is gone
// (design §7, change 1); the search and "New issue" are the actions of Hammurapi.
export function Shell() {
  const { t } = useTranslation();
  const { me, profile, config, isAnyAdmin } = useSession();
  // FTR.HMR.CMN-0006: the chat of the agent in Nabu, the built-in agent until
  // the transfer, or no agent at all (R9).
  const agentKind = !config.agent ? "builtin" : !config.agent.enabled ? "none" : (config.agent.provider ?? "builtin");
  const chat = useChatContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
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

  return (
    <div className="app">
      <TopBar logo="/logo.png" name="Hammurapi" Link={RouterLink} profileMenu={profileMenu}
        sections={STAGES.map((s) => ({ key: s.key, label: t(`stages.${s.key}`), href: s.to, active: current === s.key }))}
        center={(
          <form className="search" role="search" onSubmit={submitSearch}>
            <Icon name="search" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("top.search")}
              aria-label={t("top.search")}
            />
          </form>
        )}
        actions={(
          <button className="btn primary sm" onClick={() => setCreating(true)} aria-label={t("top.newIssue")}>
            <Icon name="plus" />
            <span className="hide-m">{t("top.newIssue")}</span>
          </button>
        )}
        avatar={<Avatar name={me.displayName} url={me.avatarUrl} />}
        menu={isAnyAdmin && isAdminPath(location.pathname) ? { label: t("admin.title"), render: adminNav } : undefined} />
      {/* FTR.HMR.SPEC-0001 R8: folded, the panel stays mounted and hidden; the rail takes its column */}
      <div className={`hbody${chat.collapsed ? " chat-collapsed" : ""}`}>
        <Outlet />
        {agentKind === "nabu" ? <NabuChatPanel /> : agentKind === "none" ? <NoAgentPanel /> : <ChatPanel />}
        {chat.collapsed && <ChatRail kind={agentKind === "nabu" ? "nabu" : agentKind === "none" ? "none" : "builtin"} />}
      </div>
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
