import type { LanguageCode } from "./languages";

/** Default suggested questions, used by the seed and as a fallback when the database is unreachable. */
export const DEFAULT_SUGGESTED_QUESTIONS: Record<LanguageCode, [string, string, string, string]> = {
  en: ["How does Lendermarket work?", "What is Auto Invest?", "How can I deposit or withdraw funds?", "What are the risks of investing?"],
  et: ["Kuidas Lendermarket toimib?", "Mis on Auto Invest?", "Kuidas saan raha sisse maksta või välja võtta?", "Millised on investeerimise riskid?"],
  es: ["¿Cómo funciona Lendermarket?", "¿Qué es Auto Invest?", "¿Cómo puedo depositar o retirar fondos?", "¿Cuáles son los riesgos de invertir?"],
  it: ["Come funziona Lendermarket?", "Che cos'è Auto Invest?", "Come posso depositare o prelevare fondi?", "Quali sono i rischi dell'investimento?"],
  fr: ["Comment fonctionne Lendermarket ?", "Qu'est-ce qu'Auto Invest ?", "Comment puis-je déposer ou retirer des fonds ?", "Quels sont les risques liés à l'investissement ?"],
  de: ["Wie funktioniert Lendermarket?", "Was ist Auto Invest?", "Wie kann ich Geld einzahlen oder auszahlen?", "Welche Risiken birgt das Investieren?"],
  pl: ["Jak działa Lendermarket?", "Czym jest Auto Invest?", "Jak mogę wpłacić lub wypłacić środki?", "Jakie są ryzyka związane z inwestowaniem?"],
};
