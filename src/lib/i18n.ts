import en from "@/locales/en.json";
import et from "@/locales/et.json";
import es from "@/locales/es.json";
import it from "@/locales/it.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import pl from "@/locales/pl.json";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "./languages";

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const messages: Record<LanguageCode, Messages> = { en, et, es, it, fr, de, pl };

/** Translate a key, interpolating `{name}` placeholders. Falls back to English. */
export function t(
  language: string,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const lang: LanguageCode = isLanguageCode(language) ? language : DEFAULT_LANGUAGE;
  let text = messages[lang][key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
