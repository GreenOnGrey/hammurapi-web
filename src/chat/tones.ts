import type { IconName } from "@green-on-grey/ui-kit";
import type { Tone } from "../api/types";

/** What the avatar of the built-in agent looks like per tone: the drawings and
 * the colours are the ones of Nabu (FTR.NAB.CMN-0005 design §7, change 3). The
 * kit knows nothing of tones (R7), and Hammurapi calls the short one `concise`. */
const LOOK: Record<Tone, { icon: IconName; variant: string }> = {
  business: { icon: "tBusiness", variant: "business" },
  friendly: { icon: "tFriendly", variant: "friendly" },
  concise: { icon: "tBrief", variant: "brief" },
  mentor: { icon: "tMentor", variant: "mentor" },
};

export const agentLook = (tone: Tone) => LOOK[tone] ?? LOOK.business;
