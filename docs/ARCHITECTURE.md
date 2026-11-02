# Architecture

## Request flow: `POST /api/chat`

1. **Validate**: a strict Zod schema (`src/lib/chat-service.ts`) checks the message (≤ 4000 characters hard limit, with an admin-configurable lower limit), the history (≤ 40 turns, `user`/`assistant` roles only), the selected language and an anonymous session id. The body is limited to 96 KB.
2. **Rate limit**: a sliding window per client IP, per minute and per day (`src/lib/rate-limit.ts`). IPs are held in memory only.
3. **Redact**: e-mails, IBANs, Luhn-valid card numbers, 11-digit national IDs, phone numbers and "password/PIN/code: …" values are removed before any AI call (`src/lib/redact.ts`).
4. **Language**: an explicit selection wins. Otherwise detection combines function-word scoring with franc trigrams (`src/lib/language-detect.ts`). If neither is sure, the interface language is used.
5. **Retrieve**: hybrid search (`src/lib/retrieval.ts`):
   - PostgreSQL full-text search (`simple` config, GIN index, prefix terms) over chunks of **published and processed** documents;
   - embedding cosine similarity (OpenAI `text-embedding-3-small` by default);
   - published FAQs.
   Results are fused with reciprocal-rank fusion. Only the newest version per document group is kept, chunks per source are capped, and a relevance gate applies. If nothing passes the gate, the model is **not called**: the localised "couldn't find verified information" answer and an escalation offer are returned.
6. **Generate**: the stable system prompt (`src/lib/prompt.ts`, cached by providers) holds the grounding, compliance and injection rules. Retrieved sources and the question go into the user turn as escaped `<source>` / `<question>` blocks. The model must cite `[S#]`, or output `NO_ANSWER`, `[CONFLICT]` or `[ESCALATE]`.
7. **Validate output** (`src/lib/citations.ts`): citations that don't map to a retrieved source are dropped. Real ones are renumbered `[1]…`. Uncited numeric claims, provider refusals and system-prompt leaks (canary token) are replaced by the safe localised message.
8. **Stream**: NDJSON events go to the browser (`meta`, `delta`*, `done` | `error`). The browser hides markers while streaming and replaces the text with the validated final answer.
9. **Analytics**: one row with language, category, status, latency, tokens and cost. It contains no message text.

## AI provider abstraction

`src/lib/ai/types.ts` defines `AIProviderAdapter.generate({ system, messages, settings, onDelta })`. Adapters:

- `anthropic.ts`: Anthropic SDK, streaming, prompt caching on the system prompt, `output_config.effort`, and server-side refusal fallbacks (`fallbacks: "default"`) on models that support them. Temperature is never sent to current Claude models, which reject it.
- `openai.ts`: Chat Completions streaming with usage; `temperature` for classic models and `reasoning_effort` for reasoning models.

`capabilities.ts` decides which parameters a model accepts. The admin UI shows only those, and the server strips everything else. **To add a provider** (for example a self-hosted open-weight model behind an OpenAI-compatible or custom API): implement the adapter, register it in `registry.ts`, add its name to `PROVIDER_NAMES`, and extend `modelCapabilities`.

The **fallback model** is used only when an administrator has explicitly marked a configuration as fallback, and only if no text has been streamed yet.

## Knowledge ingestion

`POST /api/admin/documents` validates the extension and magic bytes, screens out active PDF content and macros, stores the file privately (`src/lib/storage`), creates a `KnowledgeDocument` (DRAFT/PENDING) and queues processing. The pipeline (`src/lib/ingestion/pipeline.ts`) extracts text (unpdf for PDF with page numbers, mammoth for DOCX with headings, papaparse for CSV, raw TXT/MD), normalises it, chunks it (~1200 characters, heading-aware, with paragraph overlap), embeds it, and stores the chunks transactionally. A document is used in answers only when `processingStatus = READY` **and** `publicationStatus = PUBLISHED` (an administrator approval). Publishing a version archives the group's other versions.

The queue runs in-process. If the container restarts mid-job, the document stays `PROCESSING` and the admin clicks **Reprocess**. To scale, move `processDocument` into a separate Railway worker service polling for `PENDING` documents. The function is already self-contained.

### Storage

- `DOCUMENT_STORAGE=database` (default): bytes in the `StoredFile` table. It is durable and private, and needs no extra service.
- `DOCUMENT_STORAGE=s3`: any S3-compatible bucket (Railway Buckets, AWS S3, Cloudflare R2).

Investors never get storage links. Citations use the official `sourceUrl` or, only when an admin enables it, `/api/sources/:id`, which serves **published** documents with a sandboxing CSP.

## Embeddings and the vector index

Embeddings are stored as `double precision[]` on `DocumentChunk.embedding` and `FAQ.embedding`, together with the model name. Retrieval loads the vectors of published chunks for the current model into memory (60 s cache, invalidated on publish changes) and computes cosine similarity. Railway's default PostgreSQL image does not guarantee the `pgvector` extension, so the default setup avoids depending on it.

**pgvector upgrade path** (recommended above ~20k chunks):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "DocumentChunk" ADD COLUMN embedding_vec vector(1536);
UPDATE "DocumentChunk" SET embedding_vec = embedding::vector WHERE cardinality(embedding) = 1536;
CREATE INDEX ON "DocumentChunk" USING hnsw (embedding_vec vector_cosine_ops);
```

Then replace the in-memory scoring in `retrieveKnowledge` with `ORDER BY embedding_vec <=> $query LIMIT 20`. The dimension must match `EMBEDDING_MODEL`. If you change the embedding model, reprocess all documents.

## Security controls

| Area | Control |
|---|---|
| Secrets | Env vars only, read server-side (`src/lib/env.ts`). No keys in the DB or the client bundle. |
| Admin auth | Individual accounts, scrypt hashes, 8 h DB-backed sessions (only the SHA-256 of the token is stored), HMAC-signed `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Login rate limiting and timing-safe checks. |
| Authorization | `adminRoute(role, …)` on every admin endpoint. Server-side check in the dashboard layout. Roles OWNER > ADMIN > EDITOR > VIEWER. |
| CSRF | SameSite=Strict plus an Origin/Host match on every state-changing admin request. |
| XSS | React escaping. Markdown is rendered with `skipHtml` and an element allowlist. Links open with `noopener`. |
| Headers | CSP (`default-src 'self'`, `frame-ancestors` restricted), HSTS, nosniff, Referrer-Policy, Permissions-Policy (`src/proxy.ts`). |
| Widget | Sandboxed cross-origin iframe in a closed shadow root. postMessage validated by origin, source window and type. |
| SSRF | https only, host allowlist, every redirect re-validated, DNS resolved and private/metadata ranges rejected, size and time limits (`src/lib/ssrf.ts`). |
| Uploads | Size limit, extension plus magic-byte validation, UTF-8 check, active-content screening. |
| Prompt injection | Retrieved text and questions escaped inside data blocks and declared untrusted. Non-removable compliance rules. Canary leak detection. Uncited numeric claims blocked. |
| Abuse and cost | Per-IP rate limits, message and history limits, `max_tokens` caps, timeouts, no model call without evidence. |
| Audit | `AuditLog` for every admin change and login. Sanitized `OperationalError` log. |

**Database privileges**: the app needs DML on its tables, plus DDL only during `prisma migrate deploy`. If your Railway plan allows it, create a separate restricted role for runtime traffic and keep the owner role for migrations.

## Scaling notes

- Rate limiter and ingestion queue: in-memory, one instance. For several replicas, move them to Redis or Postgres.
- Analytics retention purge runs at most hourly, triggered by admin analytics views. A Railway cron can call the analytics endpoint for regular purging.
