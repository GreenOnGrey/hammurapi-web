import { useTranslation } from "react-i18next";
import { AgentSettingsMenu } from "@green-on-grey/ui-kit/chat";
import type { Tone } from "../api/types";
import { useSession } from "../app/session";
import { useProfilePatch } from "../app/useProfilePatch";
import { agentLook } from "./tones";

const TONES: Tone[] = ["business", "friendly", "concise", "mentor"];

/** Name and tone of the agent, opened from the agent's avatar in the chat
 * (FTR.HMR.CMN-0001 design §3). The menu is the kit's, the same as in Nabu
 * (FTR.HMR.SPEC-0001): no model block — the models of the built-in agent are set
 * by the administrator; the hint says the profile keeps them. */
export function AgentSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useSession();
  const patch = useProfilePatch();
  return (
    <AgentSettingsMenu name={profile.agentName} value={profile.agentTone} hint={t("profile.toneHint")}
      options={TONES.map((tone) => ({ key: tone, label: t(`tones.${tone}`), icon: agentLook(tone).icon }))}
      onRename={(agentName) => patch.mutate({ agentName })} onPick={(tone) => patch.mutate({ agentTone: tone as Tone })} onClose={onClose} />
  );
}
