import type { TFunction } from "i18next";

/** The user's text of an LLM error class (FTR.HMR.CMN-0004 design §4). */
export function llmErrorText(t: TFunction, errorClass: string, connection = ""): string {
  return t(`llm.errors.${errorClass}`, { connection, defaultValue: t("llm.errors.bad_request") });
}

/** Errors the user can fix by waiting; the others need an administrator. */
export const transientLLMError = (errorClass: string) =>
  errorClass === "rate_limit" || errorClass === "unavailable" || errorClass === "agent_crashed";

const PREFIX = /^\[llm:([a-z_]+)\|([^\]]*)\]\s*/;

/** Parses the reason of a run stopped by an LLM error: "[llm:<class>|<connection>] text". */
export function parseLLMReason(text: string | null | undefined): { errorClass: string; connection: string } | null {
  const m = PREFIX.exec(text ?? "");
  return m ? { errorClass: m[1], connection: m[2] } : null;
}

/** The blocked reason in the user's language when it is an LLM error. */
export function blockedReason(t: TFunction, text: string | null | undefined): string {
  if (text === "no_service_agent") return t("writer.run.noAgent"); // FTR.HMR.DEV-0001 R32
  const r = parseLLMReason(text);
  return r ? llmErrorText(t, r.errorClass, r.connection) : text ?? "";
}
