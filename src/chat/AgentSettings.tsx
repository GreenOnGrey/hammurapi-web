import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tone } from "../api/types";
import { useSession } from "../app/session";
import { useProfilePatch } from "../app/useProfilePatch";
import { useOutside } from "@green-on-grey/ui-kit";

const TONES: Tone[] = ["business", "friendly", "concise", "mentor"];

/** Name and tone of the agent, opened from the agent's avatar in the chat (FTR.HMR.CMN-0001 design §3). */
export function AgentSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useSession();
  const patch = useProfilePatch();
  const [agentName, setAgentName] = useState(profile.agentName);
  const ref = useOutside<HTMLDivElement>(true, onClose);

  const saveName = () => {
    const name = agentName.trim();
    if (name && name !== profile.agentName) patch.mutate({ agentName: name });
  };

  return (
    <div className="menu agent-pop" ref={ref} role="dialog" aria-label={t("chat.agentSettings")}>
      <div className="sec">
        <div className="lab">{t("profile.agentName")}</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="inp" value={agentName} maxLength={40} aria-label={t("profile.agentName")} autoFocus
            onChange={(e) => setAgentName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </div>
      </div>
      <div className="sec">
        <div className="lab">{t("profile.tone")}</div>
        <div className="chips">
          {TONES.map((tone) => (
            <button key={tone} className={`chip${profile.agentTone === tone ? " on" : ""}`} onClick={() => patch.mutate({ agentTone: tone })}>
              {t(`tones.${tone}`)}
            </button>
          ))}
        </div>
        <div className="hint">{t("profile.toneHint")}</div>
      </div>
    </div>
  );
}
