import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, useOutside, useToast } from "@green-on-grey/ui-kit";
import { Chat, ChatLayout, ConversationList } from "@green-on-grey/ui-kit/chat";
import { ApiError, api } from "../api/client";
import type { NabuAgent, NabuTone } from "../api/types";
import { useChatContext } from "../app/session";
import { errorText } from "../lib/errors";
import { nabuKeys, useNabuAgent, useNabuConversation, useNabuConversations } from "./nabuAdapter";

// FTR.HMR.CMN-0006 R5, R6: the chat is a window to the personal agent of the
// user in Nabu — the same main conversation, topics and memory as in Nabu and
// Telegram. The conversation and the list of conversations are the components
// of the kit, the same as on the site of Nabu (FTR.NAB.CMN-0005 R14); the data
// comes from ./nabuAdapter.

const NABU_TONES: NabuTone[] = ["business", "friendly", "brief", "mentor"];

/** The icon of the agent per tone, as on the site of Nabu: the tone is shown
 * by the icon, not by a caption (FTR.NAB.CMN-0001 R31). */
const TONE_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;

function AgentIcon({ tone, small }: { tone: NabuTone | undefined; small?: boolean }) {
  return (
    <span className={`nbagent${small ? " s" : ""}`} aria-hidden="true">
      <Icon name={TONE_ICONS[tone ?? "business"] ?? "tBusiness"} size={small ? 14 : 18} />
    </span>
  );
}

export { useNabuAgent };

export function NabuChatPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  const agent = useNabuAgent();
  const { rows, offline, create } = useNabuConversations();
  const [convId, setConvId] = useState("main");
  const [agentMenu, setAgentMenu] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const a = agent.data;
  const unavailable = agent.error instanceof ApiError && agent.error.status >= 500;
  // FTR.NAB.CMN-0002 R15, R18: the channel is closed for the user in Nabu or the account is archived there
  const closed = agent.error instanceof ApiError && (agent.error.code === "user_archived" || agent.error.code === "channel_unavailable");

  return (
    <aside className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <button className="avatar-btn" onMouseDown={(e) => agentMenu && e.stopPropagation()} onClick={() => setAgentMenu((v) => !v)}
            aria-label={t("chat.agentSettings")} aria-expanded={agentMenu} title={a ? t(`nabu.tones.${a.tone}`) : t("chat.agentSettings")} disabled={!a}>
            <AgentIcon tone={a?.tone} />
          </button>
          <div style={{ minWidth: 0 }}>
            <b>{a?.name ?? "…"}</b>
            {a?.model && <div className="small muted mono" title={a.model.connection}>{a.model.name}</div>}
          </div>
          {/* the conversations lie over the messages, as on a phone in Nabu (FTR.NAB.CMN-0005 design §6.2) */}
          <button className={`iconbtn${listOpen ? " on" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setListOpen((v) => !v)}
            aria-label={t("nabu.conversation")} aria-expanded={listOpen}>
            <Icon name="msg2" />
          </button>
          <button className="iconbtn chat-close" onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && a && <NabuAgentMenu agent={a} onClose={() => setAgentMenu(false)} />}
        <div className="ctx">
          {chat.subject ? (
            <><span className="fid">{chat.subject.key}</span> {chat.area ? t(`areas.${chat.area}`) : chat.subject.title}</>
          ) : t("nabu.noContext")}
        </div>
        {(offline || unavailable) && !closed && <div className="llmerr amber small" role="status">{t("errors.nabu_unavailable")}</div>}
        {closed && <div className="llmerr amber small" role="status">{t("errors.channel_unavailable")}</div>}
      </div>
      <ChatLayout narrow>
        <ConversationList conversations={rows} currentId={convId} open={listOpen} onClose={() => setListOpen(false)}
          onPick={(id) => { setConvId(id); setListOpen(false); }}
          onCreate={async (title) => { setConvId(await create(title)); setListOpen(false); }} />
        <Conversation key={convId} convId={convId} agentName={a?.name ?? "Nabu"} />
      </ChatLayout>
    </aside>
  );
}

function Conversation({ convId, agentName }: { convId: string; agentName: string }) {
  const { t } = useTranslation();
  const chat = useNabuConversation(convId);
  return <Chat {...chat} agentName={agentName} emptyHint={t("nabu.empty", { name: agentName })} />;
}

/** Name and tone of the personal agent, saved in Nabu for every channel (R6). */
function NabuAgentMenu({ agent, onClose }: { agent: NabuAgent; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(agent.name);
  const ref = useOutside<HTMLDivElement>(true, onClose);
  const patch = useMutation({
    mutationFn: (body: { name?: string; tone?: NabuTone }) => api.patch<NabuAgent>("/api/v1/agent", body),
    onSuccess: (a) => qc.setQueryData(nabuKeys.agent, a),
    onError: (e) => toast({ kind: "error", title: errorText(t, e) }),
  });
  const saveName = () => {
    const v = name.trim();
    if (v && v !== agent.name) patch.mutate({ name: v });
  };
  return (
    <div className="menu agent-pop" ref={ref} role="dialog" aria-label={t("chat.agentSettings")}>
      <div className="sec">
        <div className="lab">{t("profile.agentName")}</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="inp" value={name} maxLength={40} aria-label={t("profile.agentName")} autoFocus
            onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </div>
      </div>
      <div className="sec">
        <div className="lab">{t("profile.tone")}</div>
        <div className="nbtones">
          {NABU_TONES.map((tone) => (
            <button key={tone} className={`nbtone${agent.tone === tone ? " on" : ""}`} aria-pressed={agent.tone === tone} onClick={() => patch.mutate({ tone })}>
              <AgentIcon tone={tone} small />
              {t(`nabu.tones.${tone}`)}
            </button>
          ))}
        </div>
        <div className="hint">{t("nabu.toneHint")}</div>
      </div>
    </div>
  );
}

/** Instead of the chat when Hammurapi works without the agent (R9, design §6). */
export function NoAgentPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  return (
    <aside className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <b>{t("noAgent.title")}</b>
          <button className="iconbtn chat-close" style={{ marginLeft: "auto" }} onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="msgs">
        <div className="noagent">
          <Icon name="cpu" size={22} />
          <div style={{ marginTop: 6 }}><b>{t("noAgent.title")}</b></div>
          <div className="small muted" style={{ marginTop: 4 }}>{t("noAgent.text")}</div>
        </div>
      </div>
    </aside>
  );
}
