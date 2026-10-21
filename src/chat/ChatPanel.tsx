import { apiUrl } from "../api/base";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Avatar, Icon } from "@green-on-grey/ui-kit";
import { Chat, ChatLayout } from "@green-on-grey/ui-kit/chat";
import { api } from "../api/client";
import { keys } from "../api/queries";
import type { Attachment, ChatMode, List } from "../api/types";
import { useChatContext, useSession } from "../app/session";
import { bytes, relativeTime } from "../lib/format";
import { AgentSettings } from "./AgentSettings";
import { CHAT_PANEL_ID, CollapseButton } from "./ChatRail";
import { useOwnChat } from "./ownAdapter";
import { agentLook } from "./tones";

/** The panel of the built-in agent: its header, the modes and the files are
 * Hammurapi's; the conversation is the component of the kit, the same as in
 * Nabu (FTR.NAB.CMN-0005 R14). The data comes from ./ownAdapter. */
export function ChatPanel() {
  const { t } = useTranslation();
  const { profile } = useSession();
  const chat = useChatContext();
  const [mode, setMode] = useState<ChatMode>("general");
  const [view, setView] = useState<"chat" | "files">("chat");
  const [agentMenu, setAgentMenu] = useState(false);
  const closeAgentMenu = useCallback(() => setAgentMenu(false), []);

  // The mode follows the screen: a subject opens "Specification", and the user
  // can switch back. A new subject resets it during render, without an effect.
  const subjectKey = chat.subject?.key;
  const [modeOf, setModeOf] = useState<string | undefined>(undefined);
  if (modeOf !== subjectKey) {
    setModeOf(subjectKey);
    setMode(subjectKey ? "spec" : "general");
  }

  const { session, ...own } = useOwnChat(mode);

  return (
    <aside
      id={CHAT_PANEL_ID}
      className={`chat${chat.open ? " open" : ""}`}
      aria-label={t("chat.title")}
    >
      <div className="chat-h">
        <div className="who">
          {view === "files" ? (
            <>
              <button
                className="iconbtn"
                onClick={() => setView("chat")}
                aria-label={t("chat.backToChat")}
              >
                <Icon name="back" />
              </button>
              <b>{t("chat.myFiles")}</b>
            </>
          ) : (
            <>
              <button
                className="avatar-btn"
                // The popover closes on an outside mousedown; keep this click a toggle.
                onMouseDown={(e) => agentMenu && e.stopPropagation()}
                onClick={() => setAgentMenu((v) => !v)}
                aria-label={t("chat.agentSettings")}
                aria-expanded={agentMenu}
                title={t("chat.agentSettings")}
              >
                <Avatar agent {...agentLook(profile.agentTone)} name={profile.agentName} />
              </button>
              <div>
                <b>{profile.agentName}</b>
                <div className="small muted">
                  {t("chat.tone", { tone: t(`tones.${profile.agentTone}`) })}
                </div>
                {session?.configured && session.model && (
                  <div className="small muted mono" title={session.connectionName}>
                    {session.model}
                  </div>
                )}
              </div>
              <button
                className="iconbtn"
                style={{ marginLeft: "auto" }}
                onClick={() => setView("files")}
                aria-label={t("chat.myFiles")}
              >
                <Icon name="files" />
              </button>
            </>
          )}
          {view === "files" && <span className="chat-h-grow" />}
          <CollapseButton />
          <button
            className="iconbtn chat-close"
            onClick={() => chat.setOpen(false)}
            aria-label={t("common.close")}
          >
            <Icon name="x" />
          </button>
        </div>
        {agentMenu && view === "chat" && (
          <AgentSettings onClose={closeAgentMenu} />
        )}
        {view === "chat" && (
          <div className="ctx">
            {mode === "spec" && chat.subject ? (
              <>
                <span className="fid">{chat.subject.key}</span>{" "}
                {chat.area ? t(`areas.${chat.area}`) : chat.subject.title}
              </>
            ) : (
              t("chat.generalHint")
            )}
          </div>
        )}
      </div>

      {view === "files" ? (
        <FilesView />
      ) : (
        <ChatLayout narrow>
          <Chat
            {...own}
            agentName={profile.agentName}
            emptyHint={t("chat.empty", { name: profile.agentName })}
            // the modes stand over the composer (FTR.NAB.CMN-0005 design §6.5)
            aboveComposer={(
              <div className="chat-modes">
                <div className="seg" role="group" aria-label={t("chat.mode")}>
                  <button
                    aria-pressed={mode === "spec"}
                    disabled={!chat.subject}
                    onClick={() => setMode("spec")}
                  >
                    {t("chat.modeSpec")}
                  </button>
                  <button
                    aria-pressed={mode === "general"}
                    onClick={() => setMode("general")}
                  >
                    {t("chat.modeGeneral")}
                  </button>
                </div>
              </div>
            )}
          />
        </ChatLayout>
      )}
    </aside>
  );
}

function FilesView() {
  const { t, i18n } = useTranslation();
  const files = useQuery({
    queryKey: keys.attachments,
    queryFn: () => api.get<List<Attachment>>("/api/v1/attachments?limit=200"),
  });
  return (
    <div className="msgs">
      <div className="files">
        {files.data?.items.length === 0 && (
          <p className="muted small">{t("chat.noFiles")}</p>
        )}
        {files.data?.items.map((f) => (
          <a
            key={f.id}
            className="f"
            href={apiUrl(`/api/v1/attachments/${f.id}`)}
          >
            <div className="thumb">
              {(f.fileName.split(".").pop() ?? "").slice(0, 4).toUpperCase()}
            </div>
            <div>
              {f.fileName}
              <div className="muted">
                {relativeTime(f.createdAt, i18n.language)},{" "}
                {bytes(f.sizeBytes, i18n.language)},{" "}
                {f.feature ??
                  (f.mode === "general"
                    ? t("chat.tagGeneral")
                    : t("chat.notSent"))}
              </div>
            </div>
          </a>
        ))}
      </div>
      <div className="small muted">{t("chat.retention")}</div>
    </div>
  );
}
