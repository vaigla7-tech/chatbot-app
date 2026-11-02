# Lendermarket Investor Relations AI Copilot

A multilingual, source-grounded investor-information chatbot for Lendermarket, with a secure admin dashboard. It runs on Railway and deploys automatically from the `main` branch.

- **Public chatbot** at `/`, plus an **embeddable website widget** (`/embed.js` → `/widget` iframe). No login is needed.
- **Admin dashboard** at `/admin`. It has individual accounts, roles, server-side authorization and an audit log.
- **Answers come only from approved knowledge**: published documents, published FAQs and approved website pages. Every answer carries validated source citations. When no verified source exists, the bot says so and offers a support contact.
- **7 languages**: EN, ET, ES, IT, FR, DE and PL. The bot detects the language automatically, and the user can also pick one manually.
- **Privacy**: conversations live only in the browser tab (kept in `sessionStorage`, so they survive a reload but are deleted when the tab closes). The database stores no transcripts and no raw questions. Analytics record topic categories only.

> This assistant provides general information only and does not offer personalised financial advice.

---

## Architecture at a glance

```
Browser (page or widget iframe)                 Railway: Next.js service
  in-memory chat state  ──POST /api/chat──►  validate → rate-limit → redact PII
                         ◄──NDJSON stream──   detect language → hybrid retrieval (FTS + embeddings)
                                              → provider adapter (Anthropic | OpenAI) → citation check
                                              → privacy-safe analytics
Admin (/admin) ──/api/admin/*──► auth + RBAC → documents / FAQs / website sources / AI settings / settings
                                              ↓
                                Railway PostgreSQL (Prisma)  +  private document storage (DB or S3 bucket)
```

For details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (design decisions, retrieval and embeddings, the pgvector upgrade path, how to add AI providers) and [docs/PRIVACY.md](docs/PRIVACY.md) (data inventory and retention, for the privacy and legal review).

## Tech stack

Next.js 16 (App Router, Route Handlers), React 19, TypeScript (strict), Tailwind CSS 4 with shadcn-style components, Lucide icons, Zod, Prisma 6 and PostgreSQL, the Anthropic SDK and the OpenAI SDK, and Vitest.

---

## Deploying on Railway

The app is built and run entirely on Railway. It does not need a local server or a local database.

1. **Services**: in the Railway project, add a **PostgreSQL** service next to this GitHub-connected service.
2. **Variables**: on the app service, set the variables below. Use [.env.example](.env.example) as the template.

   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | yes | `${{Postgres.DATABASE_URL}}` |
   | `ADMIN_AUTH_SECRET` | yes | ≥ 32 random characters (`openssl rand -base64 48`). Also used as the one-time setup token. |
   | `APP_URL` | yes | Public URL of this service |
   | `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` | yes (one) | Server-side only |
   | `AI_PROVIDER`, `AI_MODEL` | optional | Default model used before an admin activates one (default `anthropic` / `claude-opus-5-5`) |
   | `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` | optional | `openai` + `text-embedding-3-small` (default). Use `none` for keyword-only retrieval. |
   | `DOCUMENT_STORAGE` (+ `DOCUMENT_STORAGE_*`) | optional | `database` (default) or `s3` for a Railway Bucket, S3 or R2 |
   | `WIDGET_ALLOWED_ORIGINS` | for the widget | e.g. `https://www.lendermarket.com https://lendermarket.com` |
   | `WEBSITE_ALLOWED_HOSTS` | optional | Hosts that may be imported as website sources |

3. **Deploy**: push to `main`. [railway.json](railway.json) configures the build (`npm run build`), the pre-deploy step (`npx prisma migrate deploy && npx prisma db seed`), the start command (binds `0.0.0.0:$PORT`) and the health check (`/api/health`).
4. **First admin**: open `https://<app>/admin/setup` and enter the value of `ADMIN_AUTH_SECRET` as the setup token. This creates the owner account. The setup page disables itself once an admin exists.
5. **Go-live checklist** (in the dashboard):
   - Settings → **Support escalation destination**: enter the *verified* official support link or email.
   - Settings → **Privacy policy URL**.
   - Knowledge Base: upload and **publish** approved documents. FAQ Management: publish approved FAQs.
   - AI Settings: add and test a model, activate it, and optionally approve a fallback.
   - Embed the widget with the snippet shown on the Overview page.

The seed is idempotent and never overwrites admin edits. It creates the 7 languages, the 13 categories, the 4 suggested questions in every language, the default settings and two **draft example FAQs** marked "[Example]". Those examples are not official product facts and are never used in answers unless an admin publishes them.

### Optional: automatic website re-checks (Phase 2)

This is off by default for every source. To enable it, turn on **Auto-check** for a source and add a Railway cron service that runs:

```bash
curl -X POST "$APP_URL/api/cron/website-sync" -H "Authorization: Bearer $(printf website-sync | openssl dgst -sha256 -hmac "$ADMIN_AUTH_SECRET" | cut -d' ' -f2)"
```

When a page changes, the new content is staged for administrator approval. It is never published automatically.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server (not used in this project's workflow, which runs on Railway) |
| `npm run build` | `prisma generate` + production build. **Run before every push.** |
| `npm run start` | Production server on `0.0.0.0:$PORT` |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed defaults (idempotent) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and API tests with mocked AI providers and database |
| `npm run test:integration` | Optional live AI calls (set `RUN_AI_INTEGRATION=1` and `INTEGRATION_ANTHROPIC_API_KEY` / `INTEGRATION_OPENAI_API_KEY`) |

## Embedding the widget

```html
<script src="https://YOUR-APP.up.railway.app/embed.js" data-lang="en" defer></script>
```

Optional attributes: `data-lang`, `data-position="left"`, `data-color="#8550F6"`. The chat runs in a sandboxed iframe on the app's own origin, so it cannot read the host site's cookies, storage or DOM. Only `close` and `toggle-fullscreen` messages cross the boundary, and only after origin validation. The host origin must be listed in `WIDGET_ALLOWED_ORIGINS` (CSP `frame-ancestors`). On screens narrower than 640px the panel opens full-screen.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Deploy fails in pre-deploy | Is `DATABASE_URL` set on the app service? See the Railway deploy logs for the Prisma error. |
| `/api/health` shows `database: unavailable` | The Postgres service is down or `DATABASE_URL` is wrong. Investors see the localised "temporary technical issue" message. |
| Every answer says "couldn't find verified information" | No **published** and **ready** documents or FAQs match. Check the Knowledge Base filter "Live". Without `OPENAI_API_KEY`, retrieval is keyword-only. |
| "Assistant temporarily unavailable" | AI Settings → Test the active model. See Audit & Errors for the sanitized error code. |
| Widget does not appear or is blank | The host origin is missing from `WIDGET_ALLOWED_ORIGINS`, or the host page's CSP blocks the script or frame. |
| Document stuck in "processing" | The service restarted mid-job. Click **Reprocess**. |
| PDF ingestion fails with "no readable text" | The PDF is scanned (images only). Run OCR before uploading. |
| Admin setup says "Invalid setup token" | The token must equal the `ADMIN_AUTH_SECRET` value exactly. |

## Branding

The default theme uses the official Lendermarket palette (Indigo `#241559`, LM Purple `#8550F6` and related tones), the Lendermarket logo SVGs from the company brand pack (`public/brand/`), and Inter, the product-UI typeface (`src/app/fonts/`, SIL OFL). Logo URL, colours and the privacy link can be changed in **Settings → Branding** without code changes. The theme tokens live in [src/app/globals.css](src/app/globals.css).

## Known limitations

- Rate limiting and the ingestion queue are in-memory, which suits one Railway instance. See ARCHITECTURE.md for how to scale out.
- Vector search runs in the application over `double precision[]` embeddings. This is fine for thousands of chunks. Move to pgvector for larger knowledge bases (documented upgrade path).
- The upload screening rejects active PDF content and macros. It is not an antivirus scan.
- The translations were written carefully but should be reviewed by native speakers before launch.
- Support tickets go to an administrator-configured link or email. A direct ticket-API integration comes after the support provider is chosen.
