export const LANGUAGE_CODES = ["en", "et", "es", "it", "fr", "de", "pl"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGES: Record<LanguageCode, { name: string; nativeName: string; iso3: string }> = {
  en: { name: "English", nativeName: "English", iso3: "eng" },
  et: { name: "Estonian", nativeName: "Eesti", iso3: "est" },
  es: { name: "Spanish", nativeName: "Español", iso3: "spa" },
  it: { name: "Italian", nativeName: "Italiano", iso3: "ita" },
  fr: { name: "French", nativeName: "Français", iso3: "fra" },
  de: { name: "German", nativeName: "Deutsch", iso3: "deu" },
  pl: { name: "Polish", nativeName: "Polski", iso3: "pol" },
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}
