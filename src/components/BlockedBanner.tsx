import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { blockedReason, parseLLMReason, transientLLMError } from "../lib/llm";
import { Icon } from "@green-on-grey/ui-kit";

/** A stopped run: an LLM error is shown in the user's language, red for errors
 * of the connection and amber for temporary ones (FTR.HMR.CMN-0004 design §3.7). */
export function BlockedBanner({
  title,
  reason,
  children,
}: {
  title: ReactNode;
  reason: string | null | undefined;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const llm = parseLLMReason(reason);
  const cls =
    llm && !transientLLMError(llm.errorClass)
      ? "banner err-banner"
      : "banner warn";
  return (
    <div className={cls} role="alert">
      <Icon name="alert" />
      <span className="grow">
        {title} {blockedReason(t, reason)}
      </span>
      {children}
    </div>
  );
}
