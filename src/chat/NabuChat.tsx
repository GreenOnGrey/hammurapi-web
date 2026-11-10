import { useCallback, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, useToast } from "@green-on-grey/ui-kit";
import { AgentButton, AgentSettingsMenu, Chat, ChatLayout, ConversationList, type AgentModelChoice } from "@green-on-grey/ui-kit/chat";
import { ApiError, api } from "../api/client";
import type { NabuAgent, NabuTone } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { useFeature, useFeatureTopic, useIssue, useIssueTopic } from "../api/queries";
import type { Area, IssueStatus } from "../api/types";
import { errorText } from "../lib/errors";
import { nabuKeys, useNabuAgent, useNabuConversation, useNabuConversations, type TopicRef } from "./nabuAdapter";
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
  // FTR.HMR.DISC-0001 R4: on the page of an issue the chat is pinned to its topic
  const issueKey = chat.subject?.type === "issue" ? chat.subject.key : null;
  // FTR.HMR.DEV-0001 R16: on the Specification tab of a feature the chat is pinned to the topic of the feature
  const featureKey = chat.subject?.type === "feature" && chat.subject.pinned ? chat.subject.key : null;
  const issueTopic = useIssueTopic(issueKey ?? "", issueKey !== null);
  const featureTopic = useFeatureTopic(featureKey ?? "", featureKey !== null);
  const topic = featureKey ? featureTopic : issueTopic;
  const pinned: TopicRef | null = issueKey ? { kind: "issue", key: issueKey } : featureKey ? { kind: "feature", key: featureKey } : null;
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
          {/* the conversations lie over the messages, as on a phone in Nabu (FTR.NAB.CMN-0005 design §6.2);
              the topic of an issue has no list (FTR.HMR.DISC-0001 design §3.1) */}
          {pinned ? <span style={{ marginLeft: "auto" }} /> : (
            <button className={`iconbtn${listOpen ? " on" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setListOpen((v) => !v)}
              aria-label={t("nabu.conversation")} aria-expanded={listOpen}>
              <Icon name="msg2" />
            </button>
          )}
          <CollapseButton />
          <button className="iconbtn chat-close" onClick={() => chat.setOpen(false)} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && a && <NabuAgentMenu agent={a} onClose={closeAgentMenu} />}
        <div className={`ctx${pinned ? " topic" : ""}`} title={issueKey ? t("disc.topic.pinned") : featureKey ? t("writer.topic.pinned") : undefined}>
          {pinned && <Icon name="lock" size={13} />}
          {chat.subject ? (
            <><span className="fid">{chat.subject.key}</span> {chat.area ? t(`areas.${chat.area}`) : chat.subject.title}</>
          ) : t("nabu.noContext")}
        </div>
        {(offline || unavailable) && !closed && <div className="llmerr amber small" role="status">{t("errors.nabu_unavailable")}</div>}
        {closed && <div className="llmerr amber small" role="status">{t("errors.channel_unavailable")}</div>}
      </div>
      {pinned ? (
        <ChatLayout narrow>
          {topic.data ? (
            <Conversation key={topic.data.conversationId ?? `draft:${pinned.key}`} convId={topic.data.conversationId} topic={pinned}
              agentName={a?.name ?? "Nabu"} />
          ) : topic.error ? <div className="msgs"><div className="err-text">{errorText(t, topic.error)}</div></div> : null}
        </ChatLayout>
      ) : (
        <ChatLayout narrow>
          <ConversationList conversations={rows} currentId={convId} open={listOpen} onClose={() => setListOpen(false)}
            onPick={(id) => { setConvId(id); setListOpen(false); }}
            onCreate={async (title) => { setConvId(await create(title)); setListOpen(false); }} />
          <Conversation key={convId} convId={convId} agentName={a?.name ?? "Nabu"} />
        </ChatLayout>
      )}
    </aside>
  );
}

function Conversation({ convId, topic, agentName }: { convId: string | null; topic?: TopicRef; agentName: string }) {
  const { t } = useTranslation();
  const chat = useNabuConversation(convId, topic);
  const ctx = useChatContext(); // FTR.HMR.CMN-0002 design §3 п. 10: «Ask the agent» fills the field
  const { isExpertOf } = useSession();
  const issueKey = topic?.kind === "issue" ? topic.key : undefined;
  const featureKey = topic?.kind === "feature" ? topic.key : undefined;
  const issue = useIssue(issueKey ?? "", !!issueKey);
  const is = issueKey ? issue.data : undefined;
  const pick = (text: string) => void chat.onSend(text, [], false).catch(() => undefined);
  // FTR.HMR.DISC-0001 design §3.2: the draft of the topic is the empty conversation of Hammurapi (ui-kit `empty`);
  // an expert of an issue in verification is asked what to revise (R5)
  const draft: ReactNode = convId !== null ? undefined
    : issueKey ? <TopicDraft issueKey={issueKey} status={is?.status} expert={!!is && isExpertOf(is.domain)} onPick={pick} />
    : featureKey ? <FeatureTopicDraft featureKey={featureKey} onPick={pick} />
    : undefined;
  const placeholder = is?.status === "verification" && isExpertOf(is.domain) ? t("disc.composer") : undefined;
  return <Chat {...chat} draft={ctx.draft ?? undefined} onDraftTaken={ctx.clearDraft} agentName={agentName} emptyHint={t("nabu.empty", { name: agentName })} empty={draft} placeholder={placeholder} />;
}

/** The suggestions of the draft by the open gate and the role (FTR.HMR.DEV-0001 design §3.3). */
export function specTopicSuggestions(area: Area | null, state: "questions" | "written" | "later" | "skipped", expert: boolean): string[] {
  if (state === "later") return ["whatIn"];
  if (state === "skipped") return expert ? ["whatIn", "restore"] : ["whatIn"];
  if (state === "questions") return expert ? ["answer", "explain", "why"] : ["explain", "why"];
  if (area === "tech" || area === "qa") return expert ? ["changeThis", "coverage", "why"] : ["coverage", "why"];
  return expert ? ["addTo", "changeEarlier", "why"] : ["why"];
}

/** The draft of the topic of a feature: nothing exists in Nabu until the first message (R15). */
function FeatureTopicDraft({ featureKey, onPick }: { featureKey: string; onPick: (text: string) => void }) {
  const { t } = useTranslation();
  const ctx = useChatContext();
  const { isExpertOf } = useSession();
  const f = useFeature(featureKey).data;
  const area = ctx.area;
  const state = !f || !area ? "later"
    : f.skippedAreas.includes(area) ? "skipped"
    : (f.openQuestions[area] ?? 0) > 0 ? "questions"
    : f.gates.some((g) => g.area === area) ? "written" : "later";
  const name = area ? t(`areas.${area}`) : "";
  return (
    <div className="empty topicdraft">
      <div className="ic"><Icon name="msg" /></div>
      <b>{t("writer.topic.title", { key: featureKey })}</b>
      {t("disc.topic.draftHint")}
      <div className="sugg">
        {specTopicSuggestions(area, state, !!f && isExpertOf(f.domain)).map((s) => {
          const text = t(`writer.suggest.${s}`, { area: name });
          return <button key={s} type="button" className="chip sugchip" onClick={() => onPick(text)}>{text}</button>;
        })}
      </div>
    </div>
  );
}

/** The suggestions of the draft by the status of the issue and the role (FTR.HMR.DISC-0001 design §3.2). */
export function topicSuggestions(status: IssueStatus | undefined, expert: boolean): string[] {
  switch (status) {
    case "new":
    case "discovery":
      return expert ? ["known", "similar"] : ["known"];
    case "verification":
      return expert ? ["metric", "estimate", "duplicates"] : ["value", "duplicates"];
    default:
      return ["why", "where"];
  }
}

/** The draft of the topic of an issue: nothing exists in Nabu until the first message (R2). */
function TopicDraft({ issueKey, status, expert, onPick }: { issueKey: string; status?: IssueStatus; expert: boolean; onPick: (text: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty topicdraft">
      <div className="ic"><Icon name="msg" /></div>
      <b>{t("disc.topic.title", { key: issueKey })}</b>
      {t("disc.topic.draftHint")}
      <div className="sugg">
        {topicSuggestions(status, expert).map((s) => (
          <button key={s} type="button" className="chip sugchip" onClick={() => onPick(t(`disc.suggest.${s}`))}>{t(`disc.suggest.${s}`)}</button>
        ))}
      </div>
    </div>
  );
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

