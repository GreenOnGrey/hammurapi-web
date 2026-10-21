import { useTranslation } from "react-i18next";
import { Avatar, Icon } from "@green-on-grey/ui-kit";
import { useChatContext, useSession } from "../app/session";
import { useNabuAgent } from "./nabuAdapter";
import { agentLook } from "./tones";

// FTR.HMR.SPEC-0001 R8–R10, design §3.4: on a desktop the chat folds to the
// right into a rail of 40 px. The panel stays mounted under it, so its
// subscriptions keep working and the rail can show that the agent wrote.

export const CHAT_PANEL_ID = "chat-panel";

/** "»" in the header of every panel; hidden on a phone, where the chat is an overlay (R11). */
export function CollapseButton({ style }: { style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const chat = useChatContext();
  return (
    <button
      className="iconbtn chat-collapse"
      style={style}
      onClick={() => chat.setCollapsed(true)}
      aria-label={t("chat.collapse")}
      title={t("chat.collapse")}
      aria-controls={CHAT_PANEL_ID}
      aria-expanded
    >
      <Icon name="chevrons" />
    </button>
  );
}

type Kind = "builtin" | "nabu" | "none";

export function ChatRail({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const chat = useChatContext();
  const { avatar, name } = useRailAgent(kind);
  const label = name ? t("chat.expand", { name }) : t("chat.expandPlain");
  return (
    <button
      className="chat-rail"
      onClick={() => chat.setCollapsed(false)}
      aria-label={chat.unread ? `${label}. ${t("chat.unread")}` : label}
      title={label}
      aria-controls={CHAT_PANEL_ID}
      aria-expanded={false}
    >
      <span className="chat-rail-av">
        {avatar}
        {chat.unread && <span className="chat-rail-dot" />}
      </span>
      {name && <span className="chat-rail-name">{name}</span>}
    </button>
  );
}

const NABU_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;

function useRailAgent(kind: Kind) {
  const { profile } = useSession();
  // the query is shared with the panel of Nabu; without Nabu it is not asked
  const nabu = useNabuAgent(kind === "nabu");
  if (kind === "none") return { avatar: <Icon name="msg" size={18} />, name: "" };
  if (kind === "nabu") {
    const tone = nabu.data?.tone ?? "business";
    return {
      avatar: <Avatar agent small icon={NABU_ICONS[tone] ?? "tBusiness"} variant={tone} name={nabu.data?.name ?? "Nabu"} />,
      name: nabu.data?.name ?? "Nabu",
    };
  }
  return { avatar: <Avatar agent small {...agentLook(profile.agentTone)} name={profile.agentName} />, name: profile.agentName };
}
