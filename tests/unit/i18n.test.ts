import { describe, expect, it } from "vitest";
import { messages, t } from "@/lib/i18n";
import { LANGUAGE_CODES } from "@/lib/languages";
import { detectLanguage, resolveResponseLanguage } from "@/lib/language-detect";

describe("localisation resources", () => {
  const englishKeys = Object.keys(messages.en).sort();

  it.each(LANGUAGE_CODES)("%s has every key, none empty", (code) => {
    expect(Object.keys(messages[code]).sort()).toEqual(englishKeys);
    for (const [key, value] of Object.entries(messages[code])) expect(value.trim(), `${code}.${key}`).not.toBe("");
  });

  it("keeps placeholders in every translation", () => {
    for (const code of LANGUAGE_CODES) expect(messages[code]["errors.tooLong"]).toContain("{max}");
  });

  it("uses the required English copy", () => {
    expect(t("en", "welcome.message")).toBe("Hello! I'm the Lendermarket AI Assistant. How can I help you today?");
    expect(t("en", "answer.insufficient")).toBe(
      "I'm sorry, but I couldn't find verified information about this in the available Lendermarket resources. Would you like to contact our support team?",
    );
    expect(t("en", "notice.disclaimer")).toBe("This AI assistant provides general information only and does not offer personalized financial advice.");
    expect(t("en", "errors.rateLimit")).toBe("Too many requests. Please try again later.");
  });

  it("keeps product names untranslated", () => {
    for (const code of LANGUAGE_CODES) expect(messages[code]["app.title"]).toMatch(/Lendermarket/);
  });

  it("interpolates and falls back to English for unknown languages", () => {
    expect(t("de", "errors.tooLong", { max: 1500 })).toContain("1500");
    expect(t("xx", "input.send")).toBe("Send");
  });
});

describe("language detection", () => {
  it.each([
    ["How does Auto Invest work and what are the risks involved?", "en"],
    ["Kuidas saan oma kontolt raha välja võtta ja kui kaua see aega võtab?", "et"],
    ["¿Cómo funciona la inversión automática y cuáles son los riesgos?", "es"],
    ["Come posso prelevare i fondi dal mio conto e quanto tempo ci vuole?", "it"],
    ["Comment puis-je retirer de l'argent de mon compte et combien de temps cela prend-il ?", "fr"],
    ["Wie kann ich Geld von meinem Konto auszahlen und wie lange dauert das?", "de"],
    ["Jak mogę wypłacić pieniądze z mojego konta i ile to trwa?", "pl"],
  ])("detects %s", (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });

  it("lets an explicit selection override detection", () => {
    expect(resolveResponseLanguage({ selected: "pl", uiLanguage: "en", message: "Wie funktioniert das?" })).toBe("pl");
  });

  it("falls back to the interface language when unsure", () => {
    expect(resolveResponseLanguage({ selected: null, uiLanguage: "fr", message: "??" })).toBe("fr");
  });
});
