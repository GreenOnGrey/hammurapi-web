import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { createI18n, detectLanguage, LANGUAGES, resources } from "./i18n";

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const en = flatten(resources.en.translation as Tree);

describe("locales", () => {
  for (const lng of LANGUAGES) {
    const msgs = flatten(resources[lng].translation as Tree);
    it(`${lng} has exactly the English keys`, () => {
      expect(Object.keys(msgs).toSorted()).toEqual(Object.keys(en).toSorted());
    });
    it(`${lng} messages are valid ICU`, () => {
      for (const [key, msg] of Object.entries(msgs)) {
        expect(() => new IntlMessageFormat(msg, lng), `${lng}:${key}`).not.toThrow();
      }
    });
  }
});

describe("i18n runtime", () => {
  // PROF-08: a key missing in German falls back to English, not to the key.
  it("falls back to English", async () => {
    const i18n = createI18n("de");
    await i18n.loadLanguages("de");
    i18n.addResource("en", "translation", "only.en", "English only");
    expect(i18n.t("only.en")).toBe("English only");
    expect(i18n.t("top.newFeature")).toBe("Neues Feature");
  });

  // PROF-09: Russian plural forms.
  it("uses Russian plural forms", () => {
    const i18n = createI18n("ru");
    expect(i18n.t("import.files", { count: 1 })).toBe("1 файл");
    expect(i18n.t("import.files", { count: 3 })).toBe("3 файла");
    expect(i18n.t("import.files", { count: 5 })).toBe("5 файлов");
    expect(i18n.t("import.files", { count: 21 })).toBe("21 файл");
  });

  it("interpolates ICU arguments", () => {
    const i18n = createI18n("en");
    expect(i18n.t("login.signIn", { provider: "GitLab" })).toBe("Sign in with GitLab");
    expect(i18n.t("import.confirm", { count: 2 })).toBe("Import 2 features");
  });

  it("login slogan per language (design spec §4)", () => {
    expect(createI18n("zh-CN").t("login.slogan")).toBe("太初有规范……");
    expect(createI18n("es").t("login.slogan")).toBe("En el principio era la especificación…");
  });
});

// FTR.HMR.CMN-0003: stage names and the agent step name; the keys stay the same (R4).
describe("stage names (FTR.HMR.CMN-0003)", () => {
  const stageKeys = ["stages.research", "stages.development", "stages.delivery", "focus.research", "focus.development", "focus.release"];

  // FIX3-03: no old stage names in RU and EN.
  it("RU and EN use the new stage names", () => {
    for (const lng of ["ru", "en"] as const) {
      const msgs = flatten(resources[lng].translation as Tree);
      for (const k of stageKeys) {
        expect(msgs[k], `${lng}:${k}`).not.toMatch(/Поставка|Research|Release/);
      }
    }
    const english = createI18n("en");
    expect(["general", "research", "development", "delivery"].map((k) => english.t(`stages.${k}`)))
      .toEqual(["General", "Discovery", "Development", "Delivery"]);
    const ru = createI18n("ru");
    expect(["general", "research", "development", "delivery"].map((k) => ru.t(`stages.${k}`)))
      .toEqual(["Общее", "Исследование", "Разработка", "Доставка"]);
    expect(ru.t("focus.release")).toBe("Доставка");
  });

  // R3: the agent step is Analysis / «Анализ», so it does not repeat the EN stage name.
  it("the agent step is Analysis", () => {
    const english = createI18n("en");
    expect(english.t("issue.analysis")).toBe("Analysis");
    expect(english.t("issueStatus.discovery")).toBe("Analysis in progress");
    expect(english.t("issueStatus.verification")).toBe("Awaiting verification");
    const ru = createI18n("ru");
    expect(ru.t("issue.document")).toBe("Анализ");
    expect(ru.t("issueStatus.discovery")).toBe("Анализ идёт");
    expect(ru.t("issueStatus.verification")).toBe("На верификации");
    // FIX3-05: Discovery remains only the EN stage name.
    for (const lng of LANGUAGES) {
      const msgs = flatten(resources[lng].translation as Tree);
      const left = Object.entries(msgs).filter(([k, v]) => v.includes("Discovery") && !["stages.research", "focus.research"].includes(k));
      expect(left, lng).toEqual([]);
    }
  });
});

// PROF-10: before sign-in an unsupported browser language falls back to English.
describe("detectLanguage", () => {
  it("matches supported languages", () => {
    expect(detectLanguage(["de-AT", "en"])).toBe("de");
    expect(detectLanguage(["zh-TW"])).toBe("zh-CN");
    expect(detectLanguage(["ru"])).toBe("ru");
  });
  it("falls back to the default", () => {
    expect(detectLanguage(["fr-FR", "it"])).toBe("en");
    expect(detectLanguage([], "es")).toBe("es");
  });
});
