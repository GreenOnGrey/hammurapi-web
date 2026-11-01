import { describe, expect, it } from "vitest";
import { createI18n } from "./i18n";
import { blockedReason, llmErrorText, parseLLMReason, transientLLMError } from "./llm";

describe("LLM errors (FTR.HMR.CMN-0004 design §4)", () => {
  it("parses the reason of a stopped run", () => {
    expect(parseLLMReason("[llm:insufficient_balance|DeepSeek] 402: balance")).toEqual({ errorClass: "insufficient_balance", connection: "DeepSeek" });
    expect(parseLLMReason("[llm:rate_limit|] 429")).toEqual({ errorClass: "rate_limit", connection: "" });
    expect(parseLLMReason("git push failed")).toBeNull();
    expect(parseLLMReason(null)).toBeNull();
  });

  it("shows the text of the class in the user's language", () => {
    const ru = createI18n("ru").t;
    expect(llmErrorText(ru, "insufficient_balance", "DeepSeek")).toBe("Закончился баланс подключения «DeepSeek». Сообщите администратору");
    expect(blockedReason(ru, "[llm:context_overflow|DeepSeek] too long")).toBe("Слишком большой контекст");
    expect(blockedReason(ru, "plain reason")).toBe("plain reason");
    const en = createI18n("en").t;
    expect(llmErrorText(en, "something_new")).toBe("The model did not accept the request.");
  });

  it("temporary errors are amber", () => {
    expect(transientLLMError("rate_limit")).toBe(true);
    expect(transientLLMError("unavailable")).toBe(true);
    expect(transientLLMError("auth")).toBe(false);
  });
});
