import { useTranslation } from "react-i18next";
import { AgentMenu } from "@green-on-grey/ui-kit/chat";
import type { Tone } from "../api/types";
import { useSession } from "../app/session";
import { useProfilePatch } from "../app/useProfilePatch";
import { agentLook } from "./tones";

const TONES: Tone[] = ["business", "friendly", "concise", "mentor"];

/** Name and tone of the agent, opened from the agent's avatar in the chat
 * (FTR.HMR.CMN-0001 design §3). The menu is the one of the kit, the same as in
 * Nabu (FTR.NAB.CMN-0005 R15): the tones are its options. */
export function AgentSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useSession();
  const patch = useProfilePatch();
  return (
    <AgentMenu narrow label={t("chat.agentSettings")} name={profile.agentName} value={profile.agentTone} optionsLabel={t("profile.tone")} hint={t("profile.toneHint")}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: agentLook(tone).icon }))}
      onRename={(agentName) => patch.mutate({ agentName })} onPick={(tone) => patch.mutate({ agentTone: tone as Tone })} onClose={onClose} />
  );
}
