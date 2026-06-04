# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Next production build
npm run start        # Next production server
npm run lint         # next lint
npm run typecheck    # tsc --noEmit (no test runner in this repo)
```

CLI pipeline scripts (all via `tsx`, load `.env.local` then `.env`):

```bash
npm run curate -- [path/to/profile.json]   # generate briefing → output/briefings/{stamp,latest}.json
npm run email  -- [path/to/briefing.json]  # render HTML email from briefing → output/emails/latest/
npm run send-test                          # send output/emails/latest via Resend to TEST_EMAIL_TO
npm run deliver -- <email|user_id> [--dry] # full pipeline for a real DB user (writes briefings/deliveries rows)
npm run preview -- [delivery_id]           # save a delivery's HTML to output/previews/ and open it
```

Cron endpoint (manual trigger for testing):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/deliver?dry=1&force=1&user_id=<uuid>"
# Flags: dry=1 (skip Resend), force=1 (ignore schedule), user_id=<uuid> (limit to one user)
```

## Architecture

Next.js 15 App Router + React 19 + Tailwind 4 + Supabase + Resend. TS path alias `@/*` resolves to repo root.

### Directory split

- `app/` — Next routes, server actions, pages (`/login`, `/onboarding`, `/settings`, `/admin`, plus `app/api/*` and `app/auth/confirm`).
- `src/` — non-Next code: `cli/` scripts, `prompts/` (curate/email/onboarding), `lib/` (pipeline, delivery, providers, types, pricing, url-validation, topic-normalization, admin-stats).
- `lib/supabase/` — three Supabase clients (browser, server-RSC, admin/service-role). Path is `@/lib/supabase/...`.
- `supabase/migrations/` — SQL migrations applied manually via Supabase SQL editor.
- `fixtures/` — sample profile JSON for local CLI runs.

### Provider abstraction (`src/lib/providers/`)

`getProvider(name?)` returns an `LLMProvider` with a unified `complete()` and `supportsWebSearch` flag. Selection order: explicit arg → `LLM_PROVIDER` env → `'gemini'`. Anthropic is intentionally stubbed (removed from deps). Two-tier provider usage:

- **Curate** uses the default provider and **requires `supportsWebSearch`** (Gemini today; throws otherwise).
- **Email** uses `EMAIL_LLM_PROVIDER` if set (typically DeepSeek — ~10× cheaper, no web search needed); falls back to the default.
- **Topic normalization** uses `NORMALIZE_LLM_PROVIDER` → `EMAIL_LLM_PROVIDER` → default.

`extractJson()` strips fences and brace-matches the first JSON object/array — providers often wrap JSON in markdown despite instructions.

### Pipeline (`src/lib/pipeline.ts` + `src/lib/delivery.ts`)

1. `generateBriefing(profile)` — LLM with web search → JSON briefing → `validateBriefingUrls()` HEAD-checks every URL → drops broken items.
2. If <3 valid items survive AND there were drops, a single **retry pass** (`buildRetryCuratePrompt`) asks for replacements, passing the kept/broken lists so the model doesn't repeat them. URLs already seen are filtered client-side too.
3. `generateEmail(profile, briefing)` — separate LLM call (no web search, `jsonMode: true`) → `{ assunto, html }`.
4. `runDeliveryPipeline()` (in `delivery.ts`) orchestrates the above against the real DB: inserts a `briefings` row, then a `deliveries` row (status `pending` → `sent`/`failed`/`skipped`), substitutes `{{FEEDBACK_URL_YES/NO}}` placeholders in the HTML, sends via Resend (with `List-Unsubscribe` RFC 8058 headers), updates `profiles.last_delivered_at`. Cost (`totalBRL`) is accumulated across both LLM calls and stored in `briefings.meta`.

### Profile shape gotcha — `topicos` vs `topicos_busca`

`profiles.topicos` is what the user typed (kept for UI / "you asked for this"). `profiles.topicos_busca` is an LLM-normalized version generated on save (`src/lib/topic-normalization.ts`) — that's what goes into curate prompts to avoid hallucinated URLs from temporal markers / typos. `profileForPrompt()` in `src/lib/types.ts` is the single point that swaps `topicos` for the normalized version; **always use it when building prompts**, never pass raw `Profile` to the LLM.

### Cron / scheduling

`app/api/cron/deliver/route.ts` requires `Authorization: Bearer $CRON_SECRET`. Schedule lives in `vercel.json`. **Vercel Hobby only allows 1×/day**, currently disabled (`crons: []`) — when enabled, it runs at 11h UTC = 8h São Paulo. Because of that limit, `profile.horario` is intentionally **ignored** in `isDue()`; only `is_active` and a per-frequency minimum interval (via `last_delivered_at`) are checked. Reactivate the hour check when upgrading to Pro (`0 * * * *`).

### Auth & RLS

Supabase Auth via `@supabase/ssr`. `middleware.ts` runs `getUser()` on every request to refresh tokens and gates `/onboarding`, `/settings`, `/dashboard`. RLS is enabled on `profiles`, `briefings`, `deliveries` — owners can read their own rows; writes from the pipeline use the **admin (service-role) client** which bypasses RLS. Never use the admin client in code that reaches the browser. `/api/admin/stats` is gated by matching `user.email === ADMIN_EMAIL`.

### Feedback & unsubscribe

The email contains `{{FEEDBACK_URL_YES}}` / `{{FEEDBACK_URL_NO}}` placeholders replaced just before send. `/api/feedback?id=&v=up|down` updates `deliveries.feedback`. `/api/unsubscribe?id=` supports both GET (HTML confirmation page) and POST (RFC 8058 one-click from Gmail/Outlook) and sets `profiles.is_active=false`.

## Conventions

- All user-facing copy, prompts, and log messages are **PT-BR**. The product voice ("amigo investido", dense self-contained summaries — not teasers) lives in `src/prompts/`.
- The codebase is single-tenant aware: scripts and admin client routinely operate on "the user with this email". Be careful before adding broadcast logic.
- When changing the schema, write a new file under `supabase/migrations/` (numbered) — migrations are applied by pasting into the Supabase SQL editor, not by a CLI.
- `output/`, `.next/`, `.env*`, and `fixtures/profile.json` are gitignored; CLI scripts write artifacts under `output/` freely.
