/**
 * Best-effort removal of obvious sensitive data from investor messages before
 * they are sent to an AI provider. This is a safety net, not a guarantee:
 * the UI also tells investors not to share such data.
 */

export interface RedactionResult {
  text: string;
  redacted: boolean;
  kinds: string[];
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

type Rule = { kind: string; pattern: RegExp; replace: (match: string, ...groups: string[]) => string | null };

const RULES: Rule[] = [
  {
    kind: "secret",
    // "password: hunter2", "parool on xyz", "PIN 1234", "verification code 123456"
    pattern:
      /\b(password|passwort|parool|contraseña|mot de passe|hasło|haslo|pin|otp|verification code|kood|código|codice|code|kod)(\s*(?:is|on|ist|est|es|è|to|=|:|-)?\s*)(\S{3,})/gi,
    replace: (_m, label, sep) => `${label}${sep}[REDACTED]`,
  },
  {
    kind: "email",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    replace: () => "[EMAIL REDACTED]",
  },
  {
    kind: "iban",
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    replace: () => "[IBAN REDACTED]",
  },
  {
    kind: "card",
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? "[CARD REDACTED]" : null;
    },
  },
  {
    kind: "national_id",
    // Estonian isikukood and Polish PESEL are both 11 digits.
    pattern: /\b\d{11}\b/g,
    replace: () => "[ID NUMBER REDACTED]",
  },
  {
    kind: "phone",
    pattern: /(?:\+|00)\d[\d ()-]{7,16}\d/g,
    replace: () => "[PHONE REDACTED]",
  },
];

export function redactSensitive(input: string): RedactionResult {
  let text = input;
  const kinds = new Set<string>();
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      const groups = rest.filter((g): g is string => typeof g === "string");
      const replacement = rule.replace(match, ...groups);
      if (replacement === null) return match;
      kinds.add(rule.kind);
      return replacement;
    });
  }
  return { text, redacted: kinds.size > 0, kinds: [...kinds] };
}
