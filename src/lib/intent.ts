/**
 * Lightweight multilingual keyword classifiers used for escalation hints and
 * privacy-safe analytics categories. They never store or return user text.
 */

export type EscalationReason =
  | "account_specific"
  | "withdrawal_issue"
  | "kyc_issue"
  | "complaint"
  | "no_information"
  | "conflicting_sources"
  | "model_requested"
  | "user_requested";

const ESCALATION_PATTERNS: Array<[EscalationReason, RegExp]> = [
  [
    "complaint",
    /\b(complain\w*|complaint|kaebus\w*|reclamaci\w*|queja|reclamo|reclam\w*|plainte|beschwerde|reklamacj\w*|skarg\w*)\b/i,
  ],
  [
    "kyc_issue",
    /\b(kyc|verif\w*|identity|identit\w*|isikutuvastus\w*|tuvastami\w*|ausweis\w*|weryfikacj\w*|tożsamoś\w*)\b.*\b(fail\w*|reject\w*|stuck|problem\w*|ei õnnestu\w*|rechaz\w*|rifiut\w*|refus\w*|abgelehnt|odrzuc\w*|error|issue)\b/i,
  ],
  [
    "withdrawal_issue",
    /\b(withdraw\w*|väljamakse\w*|retir\w*|prelievo|prelev\w*|retrait|auszahlung\w*|wypłat\w*)\b.*\b(not|never|missing|delayed|stuck|pole|ei|no|non|pas|nicht|nie)\b/i,
  ],
  [
    "account_specific",
    /\b(my account|my balance|my portfolio|my investments?|minu konto|minu portfell|mi cuenta|il mio conto|mon compte|mein konto|moje konto|moim koncie)\b/i,
  ],
  [
    "user_requested",
    /\b(human|agent|real person|speak to|talk to|inimese\w*|persona real|operatore|conseiller|mitarbeiter|konsultant\w*)\b/i,
  ],
];

export function detectEscalationIntent(text: string): EscalationReason | null {
  for (const [reason, pattern] of ESCALATION_PATTERNS) if (pattern.test(text)) return reason;
  return null;
}

export const DEFAULT_CATEGORIES = [
  { slug: "general-platform", name: "General platform information" },
  { slug: "investment-products", name: "Investment products" },
  { slug: "auto-invest", name: "Auto Invest" },
  { slug: "deposits-withdrawals", name: "Deposits and withdrawals" },
  { slug: "account-registration", name: "Account registration" },
  { slug: "kyc-verification", name: "KYC and identity verification" },
  { slug: "fees-charges", name: "Fees and charges" },
  { slug: "investment-risks", name: "Investment risks" },
  { slug: "buyback", name: "Buyback mechanisms" },
  { slug: "pending-overdue", name: "Pending payments and overdue investments" },
  { slug: "referral-programme", name: "Referral programme" },
  { slug: "legal-regulatory", name: "Legal and regulatory information" },
  { slug: "troubleshooting", name: "Troubleshooting and technical support" },
] as const;

const CATEGORY_PATTERNS: Array<[string, RegExp]> = [
  ["auto-invest", /auto[\s-]?invest|automaatinvest|inversión automática|investimento automatico|investissement automatique|automatisch\w* invest|automatyczn\w* inwest/i],
  ["deposits-withdrawals", /deposit|withdraw|sissemakse|väljamakse|depósito|retir|deposito|prelievo|dépôt|retrait|einzahl|auszahl|wpłat|wypłat|top[\s-]?up/i],
  ["kyc-verification", /\bkyc\b|verif|identit|isikutuvast|ausweis|weryfik|tożsam/i],
  ["fees-charges", /\bfees?\b|charge|commission|tasu|comisi|commissione|frais|gebühr|opłat|prowizj/i],
  ["investment-risks", /risk|riski|riesgo|rischi|risque|risiko|ryzyk/i],
  ["buyback", /buy[\s-]?back|tagasiost|recompra|riacquisto|rachat|rückkauf|odkup/i],
  ["pending-overdue", /pending|overdue|late payment|viivis|ootel|pendiente|atrasad|in sospeso|ritard|en attente|retard|ausstehend|überfällig|zaległ|oczekując/i],
  ["referral-programme", /referr|soovita\w* sõpra|referid|invita|parrain|empfehl|polec/i],
  ["legal-regulatory", /regulat|licen|legal|terms|reguleeri|litsents|regula|licenc|légal|réglement|lizenz|rechtlich|regulac|prawn/i],
  ["account-registration", /regist|sign[\s-]?up|open an account|konto avami|registr|inscri|anmeld|rejestr|załóż/i],
  ["troubleshooting", /error|bug|not working|login|log in|password|viga|ei tööta|no funciona|non funziona|ne fonctionne|funktioniert nicht|nie działa|błąd/i],
  ["investment-products", /loan|laen|préstamo|prestito|prêt|kredit|darlehen|pożycz|kredyt|return|tootlus|rentab|rendiment|rendite|zwrot/i],
  ["general-platform", /lendermarket|how does|kuidas toimib|cómo funciona|come funziona|comment fonctionne|wie funktioniert|jak działa/i],
];

export function classifyCategory(text: string): string {
  for (const [slug, pattern] of CATEGORY_PATTERNS) if (pattern.test(text)) return slug;
  return "uncategorized";
}
