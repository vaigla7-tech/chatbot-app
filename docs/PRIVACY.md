# Privacy and data protection notes

This document supports the privacy and legal review before production launch. Implementing these controls does **not** by itself make the service GDPR-compliant. The controller (Lendermarket) must confirm the lawful basis, notices, processor agreements and transfers.

## What is processed

| Data | Where | Retention |
|---|---|---|
| Investor chat messages and answers | Browser memory only; sent per request to the server and the configured AI provider | Not stored by this app. Cleared on refresh or close. Provider-side retention follows the AI provider's API terms and DPA. |
| Personal data typed into the chat | Redacted on a best-effort basis before reaching the AI provider (e-mail, IBAN, card, national ID, phone, secrets) | Not stored |
| Analytics events | PostgreSQL `ChatAnalyticsEvent`: timestamp, language, topic category, answer status, latency, token counts, cost, random per-tab session id, feedback ±1 | Configurable (default 180 days), then deleted |
| Escalation events | `EscalationEvent`: reason code, category, language, destination type | Same retention |
| Client IP address | Rate limiter memory only | Minutes to 24 h, never written to disk |
| Operational errors | `OperationalError`: sanitized codes and messages, no user text | Same retention |
| Administrator data | `AdminUser` (name, e-mail, role, password hash), `AdminSession`, `AuditLog` | Until removed. Sessions expire after 8 h. |
| Knowledge documents | Private storage plus extracted chunks | Until an admin deletes them |

No cookies are set for investors. The only cookie is the admin session cookie, which is strictly necessary. The chat does not use `localStorage` or `sessionStorage`.

## Third parties (processors)

- **Railway**: hosting and PostgreSQL.
- **Anthropic** and/or **OpenAI**: answer generation. **OpenAI** also creates embeddings of the question text when `EMBEDDING_PROVIDER=openai`. Confirm the DPAs, data-retention settings and international transfer mechanisms, and consider EU data residency options where available.
- Optional S3-compatible storage provider for documents.

## Investor-facing notices

The chat footer shows the general-information disclaimer and a privacy notice in all seven languages, and links to the privacy policy URL configured in Settings. Investors are told not to share passwords, codes, banking details or identity documents, and that account-specific help requires a verified support channel. Escalation never forwards the transcript. Only a predefined reason code is recorded, and the investor is redirected to the official support channel.

## Data subject requests

Investor conversations are not stored, so there is normally nothing to retrieve or erase for an investor. Analytics cannot be linked to a person. Administrator data can be corrected or removed by an Owner.

## Items to confirm before launch

- [ ] Privacy policy text and URL that cover the chatbot
- [ ] Lawful basis for processing chat content via the AI providers
- [ ] DPAs and transfer assessments with the AI providers and Railway
- [ ] Analytics retention period
- [ ] Verified official support destination
- [ ] Native-speaker review of the translations
- [ ] Legal review of the system prompt's compliance rules and of the disclaimer wording
