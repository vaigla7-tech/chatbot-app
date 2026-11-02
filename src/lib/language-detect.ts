import { franc } from "franc-min";
import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "./languages";

const ISO3_TO_CODE = Object.fromEntries(
  LANGUAGE_CODES.map((code) => [LANGUAGES[code].iso3, code]),
) as Record<string, LanguageCode>;

// Common function words per language. Overlapping words (e.g. "la", "de") simply
// score for several languages; distinctive words and letters decide.
const FUNCTION_WORDS: Record<LanguageCode, string[]> = {
  en: ["the", "and", "is", "are", "how", "what", "can", "do", "does", "my", "to", "of", "for", "with", "will", "which", "when", "where", "why", "take", "long", "much", "there", "it", "an", "about"],
  et: ["ja", "on", "kas", "kuidas", "mis", "ma", "mu", "minu", "see", "kui", "ei", "saan", "oma", "välja", "raha", "või", "kaua", "aega", "mida", "miks", "kus", "palju", "seda"],
  es: ["el", "los", "las", "que", "cómo", "como", "qué", "es", "mi", "para", "con", "por", "una", "puedo", "cuáles", "son", "del", "mis", "cuánto", "y"],
  it: ["il", "lo", "gli", "di", "che", "come", "cosa", "è", "mio", "per", "con", "una", "posso", "dal", "quanto", "sono", "quali", "del", "ci", "vuole"],
  fr: ["le", "les", "des", "que", "comment", "est", "mon", "pour", "avec", "une", "je", "du", "quels", "sont", "combien", "cela", "puis", "qu'est-ce", "et"],
  de: ["der", "die", "das", "und", "ist", "wie", "was", "ich", "mein", "meinem", "für", "mit", "ein", "eine", "kann", "von", "welche", "dauert", "lange", "geld"],
  pl: ["w", "na", "do", "z", "się", "jak", "czy", "co", "jest", "mój", "moje", "mojego", "mogę", "ile", "to", "jakie", "są", "trwa", "konta"],
};

const LETTER_HINTS: Array<[LanguageCode, RegExp]> = [
  ["et", /õ/i],
  ["pl", /[ąęłńśźż]/i],
  ["de", /ß/],
  ["es", /[ñ¿¡]/i],
  ["fr", /[çœêëîô]/i],
];

function scoreLanguages(text: string): Map<LanguageCode, number> {
  const tokens = text.toLowerCase().match(/[\p{L}'-]+/gu) ?? [];
  const scores = new Map<LanguageCode, number>(LANGUAGE_CODES.map((c) => [c, 0]));
  for (const code of LANGUAGE_CODES) {
    const words = new Set(FUNCTION_WORDS[code]);
    for (const token of tokens) if (words.has(token)) scores.set(code, scores.get(code)! + 1);
  }
  for (const [code, pattern] of LETTER_HINTS) if (pattern.test(text)) scores.set(code, scores.get(code)! + 2);
  return scores;
}

/**
 * Detect which of the seven supported languages a message is written in.
 * Combines function-word scoring (reliable for short questions) with franc
 * trigram detection (better for longer text). Returns null when unsure.
 */
export function detectLanguage(text: string): LanguageCode | null {
  const sample = text.trim();
  if (sample.length === 0) return null;

  const ranked = [...scoreLanguages(sample).entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best && best[1] >= 2 && best[1] > (second?.[1] ?? 0)) return best[0];

  if (sample.length >= 20) {
    const iso3 = franc(sample, {
      only: LANGUAGE_CODES.map((c) => LANGUAGES[c].iso3),
      minLength: 10,
    });
    const code = ISO3_TO_CODE[iso3];
    if (code) return code;
  }
  return best && best[1] >= 1 && best[1] > (second?.[1] ?? 0) ? best[0] : null;
}

/**
 * Resolve the response language: an explicit user selection wins, otherwise the
 * detected language, otherwise the interface language.
 */
export function resolveResponseLanguage(opts: {
  selected: LanguageCode | null;
  uiLanguage: LanguageCode;
  message: string;
}): LanguageCode {
  if (opts.selected) return opts.selected;
  return detectLanguage(opts.message) ?? opts.uiLanguage;
}
