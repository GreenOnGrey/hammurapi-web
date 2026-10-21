import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, useToast } from "@green-on-grey/ui-kit";
import { AgentButton, AgentSettingsMenu, Chat, ChatLayout, ConversationList, type AgentModelChoice } from "@green-on-grey/ui-kit/chat";
import { ApiError, api } from "../api/client";
import type { NabuAgent, NabuTone } from "../api/types";
import { useChatContext } from "../app/session";
import { errorText } from "../lib/errors";
import { nabuKeys, useNabuAgent, useNabuConversation, useNabuConversations } from "./nabuAdapter";
import { CHAT_PANEL_ID, CollapseButton } from "./ChatRail";

// FTR.HMR.CMN-0006 R5, R6: the chat is a window to the personal agent of the
// user in Nabu — the same main conversation, topics and memory as in Nabu and
// Telegram. The conversation and the list of conversations are the components
// of the kit, the same as on the site of Nabu (FTR.NAB.CMN-0005 R14); the data
// comes from ./nabuAdapter.

const NABU_TONES: NabuTone[] = ["business", "friendly", "brief", "mentor"];

/** The icon of the agent per tone, as on the site of Nabu: the tone is shown
 * by the icon, not by a caption (FTR.NAB.CMN-0001 R31). */
const TONE_ICONS = { business: "tBusiness", friendly: "tFriendly", brief: "tBrief", mentor: "tMentor" } as const;

export { useNabuAgent };

export function NabuChatPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  const agent = useNabuAgent();
  const { rows, offline, create } = useNabuConversations();
  const [convId, setConvId] = useState("main");
  const [agentMenu, setAgentMenu] = useState(false);
  const closeAgentMenu = useCallback(() => setAgentMenu(false), []);
  const [listOpen, setListOpen] = useState(false);
  const a = agent.data;
  const unavailable = agent.error instanceof ApiError && agent.error.status >= 500;
  // FTR.NAB.CMN-0002 R15, R18: the channel is closed for the user in Nabu or the account is archived there
  const closed = agent.error instanceof ApiError && (agent.error.code === "user_archived" || agent.error.code === "channel_unavailable");

  return (
    <aside id={CHAT_PANEL_ID} className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <AgentButton icon={TONE_ICONS[a?.tone ?? "business"] ?? "tBusiness"} label={t("chat.agentSettings")}
            title={a ? t(`nabu.tones.${a.tone}`) : t("chat.agentSettings")} expanded={agentMenu} disabled={!a} onClick={() => setAgentMenu((v) => !v)} />
          <div style={{ minWidth: 0 }}>
            <b>{a?.name ?? "…"}</b>
            {a?.model && <div className="small muted mono" title={a.model.connection}>{a.model.name}</div>}
          </div>
          {/* the conversations lie over the messages, as on a phone in Nabu (FTR.NAB.CMN-0005 design §6.2) */}
          <button className={`iconbtn${listOpen ? " on" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setListOpen((v) => !v)}
            aria-label={t("nabu.conversation")} aria-expanded={listOpen}>
            <Icon name="msg2" />
          </button>
          <CollapseButton />
          <button className="iconbtn chat-close" onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && a && <NabuAgentMenu agent={a} onClose={closeAgentMenu} />}
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

/** Name, tone and model of the personal agent, saved in Nabu for every channel
 * (R6). The menu is the kit's, the same as on the site of Nabu (FTR.HMR.SPEC-0001;
 * FTR.NAB.CHAT-0001 R16, R17): Hammurapi gives the tones and the models. */
function NabuAgentMenu({ agent, onClose }: { agent: NabuAgent; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const patch = useMutation({
    mutationFn: (body: { name?: string; tone?: NabuTone; model?: AgentModelChoice }) => api.patch<NabuAgent>("/api/v1/agent", body),
    // the icon in the header changes at once, as in Nabu
    onMutate: (p) => qc.setQueryData<NabuAgent>(nabuKeys.agent, (old) => (old && (p.name || p.tone) ? { ...old, ...(p.name ? { name: p.name } : {}), ...(p.tone ? { tone: p.tone } : {}) } : old)),
    onSuccess: (a) => qc.setQueryData(nabuKeys.agent, a),
    onError: (e) => {
      toast({ kind: "error", title: errorText(t, e) });
      qc.invalidateQueries({ queryKey: nabuKeys.agent });
    },
  });
  return (
    <AgentSettingsMenu name={agent.name} value={agent.tone}
      options={NABU_TONES.map((tone) => ({ key: tone, label: t(`nabu.tones.${tone}`), icon: TONE_ICONS[tone] }))}
      models={{ available: agent.availableModels ?? [], model: agent.model, defaultModel: agent.defaultModel ?? null, chosen: !!agent.chosen, contextTokens: agent.context?.tokens ?? 0 }}
      onRename={(name) => patch.mutate({ name })} onPick={(tone) => patch.mutate({ tone: tone as NabuTone })}
      onModel={(model) => patch.mutate({ model })} onClose={onClose} />
  );
}

/** Instead of the chat when Hammurapi works without the agent (R9, design §6). */
export function NoAgentPanel() {
  const { t } = useTranslation();
  const chat = useChatContext();
  return (
    <aside id={CHAT_PANEL_ID} className={`chat${chat.open ? " open" : ""}`} aria-label={t("chat.title")}>
      <div className="chat-h">
        <div className="who">
          <b>{t("noAgent.title")}</b>
          <span className="chat-h-grow" />
          <CollapseButton />
          <button className="iconbtn chat-close" onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
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
