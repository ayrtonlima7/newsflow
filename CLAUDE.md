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
npm run reset-users                        # ⚠️ deletes ALL auth users + cascades (profiles/briefings/deliveries). Beta reset.
```

Cron endpoint (manual trigger for testing):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/deliver?dry=1&force=1&user_id=<uuid>"
# Flags: dry=1 (skip Resend), force=1 (ignore schedule/idempotency), user_id=<uuid> (limit to one user)
```

## Architecture

Next.js 15 App Router + React 19 + Tailwind 4 + Supabase + Resend. **Search via Tavily, LLM via DeepSeek.** TS path alias `@/*` resolves to repo root.

**External services (6 active):** Vercel (host) · Supabase (DB + auth) · Resend (email send + auth magic-link relay) · Tavily (web search) · DeepSeek (LLM) · GitHub Actions (hourly cron). Gemini is dormant (key kept as fallback, not used in the pipeline).

### Directory split

- `app/` — Next routes, server actions, pages (`/login`, `/onboarding`, `/settings`, `/admin`, plus `app/api/*` and `app/auth/confirm`). `app/api/dev/preview/[id]` serves delivery HTML in dev only.
- `src/` — non-Next code: `cli/` scripts, `prompts/` (curate/email), `lib/` (pipeline, delivery, providers, **search**, types, pricing, url-validation, url-recovery, topic-normalization, admin-stats).
- `lib/supabase/` — three Supabase clients (browser, server-RSC, admin/service-role). Path is `@/lib/supabase/...`.
- `supabase/migrations/` — SQL migrations applied manually via Supabase SQL editor. `supabase/scripts/` — one-off SQL (e.g. reset).
- `fixtures/` — sample profile JSON for local CLI runs.

### Search + LLM split (the big architectural decision)

**Curate does NOT use LLM web search.** Web search is delegated to **Tavily** (`src/lib/search.ts`), then DeepSeek curates the real results. This solves two problems at once: (1) URLs are real (from Tavily's index, not LLM-generated → no hallucination), (2) freshness is enforced via Tavily's `topic:news` + `days` params.

`getProvider(name?)` returns an `LLMProvider` with unified `complete()` and a `supportsWebSearch` flag. Selection order: explicit arg → `LLM_PROVIDER` env → `'gemini'` (but `LLM_PROVIDER=deepseek` in practice). Anthropic is stubbed (removed from deps). Provider usage:

- **Curate** uses `CURATE_LLM_PROVIDER` → `LLM_PROVIDER` (DeepSeek). **No web search needed** — it receives Tavily results.
- **Email** uses `EMAIL_LLM_PROVIDER` → `LLM_PROVIDER` (DeepSeek).
- **Topic normalization** uses `NORMALIZE_LLM_PROVIDER` → `EMAIL_LLM_PROVIDER` → `LLM_PROVIDER`.

`extractJson()` strips fences and brace-matches the first JSON object/array — providers wrap JSON in markdown despite instructions. `jsonMode: true` is used for curate/email.

### Pipeline (`src/lib/pipeline.ts` + `src/lib/delivery.ts`)

`generateBriefing(profile)` runs in 2 steps + filters:
1. **Tavily search** — `buildSearchQueries()` makes 1 query per topic (cap 6); `tavilySearchMany()` runs them in parallel, dedupes by URL. `topic:news`, `days = janela.janelaDias`.
2. **Reachability filter** — `filterReachableResults()` HEAD/GET-checks each result with a **browser user-agent** (bot UA gets refused by big portals like AOL). Broken links are dropped here, BEFORE the LLM sees them. With ~32 results and a 5-8 item target, we can afford to drop aggressively (no degradation).
3. **DeepSeek curate** — `buildCurateFromResultsPrompt()` passes the reachable results; the LLM selects the best and writes dense summaries. **Anti-hallucination guard:** items whose URL is NOT in the Tavily result set are filtered out (the model may only use provided URLs).
4. **Freshness backstop** — `filterByFreshness()` drops items whose `data_publicacao` is outside the window.
5. `generateEmail(profile, briefing)` — separate DeepSeek call (`jsonMode: true`) → `{ assunto, html }`. The email prompt renders `urlStatus` (all `verified` now since validation happens upfront).
6. `runDeliveryPipeline()` (in `delivery.ts`) orchestrates against the DB: inserts `briefings` row, then `deliveries` row (`pending` → `sent`/`failed`/`skipped`), substitutes `{{FEEDBACK_URL_YES/NO}}`, sends via Resend (with `List-Unsubscribe` RFC 8058 headers), updates `profiles.last_delivered_at`. Cost accumulated across both LLM calls (~R$0.035/email measured) stored in `briefings.meta`.

Note: `url-recovery.ts` (grounding-citation recovery) and `buildCuratePrompt`/`buildRetryCuratePrompt` are **legacy from the Gemini era** — no longer wired into the pipeline. Kept for reference; safe to delete.

### Frequency → window & item count (`frequenciaParaJanela` in `types.ts`)

| `frequencia` | janelaDias | itemsMin–Max |
|---|---|---|
| "Todo dia" (daily) | 1 | 5–8 |
| "A cada 3 dias" | 3 | 7–10 |
| "Uma vez por semana" | 7 | 10–15 |

`janelaDias` feeds both Tavily's `days` and the freshness cutoff. Item counts scale so frequent emails are leaner, spaced ones denser.

### Profile shape — onboarding redesign (migration 0003)

The onboarding was redesigned from "professional-centric" (area/cargo/tom) to "interest-centric". **The old columns `area`, `cargo`, `fontes_prioritarias`, `tom`, `descricoes_livres` were DROPPED in migration 0003.** Current `Profile` fields: `nome`, `tema[]`, `contexto`, `descricao_livre`, `objetivo`, `topicos[]`, `topicos_busca[]`, `referencias[]`, `formatos[]`, `ignorar[]`, `frequencia`, `horario`.

`topicos` is what the user typed; `topicos_busca` is the LLM-normalized version (`topic-normalization.ts`, generated on save) used for search queries to avoid temporal markers / typos. `profileForPrompt()` in `src/lib/types.ts` swaps `topicos` for `topicos_busca` and shapes the object for prompts — **always use it**, never pass raw `Profile` to an LLM. Onboarding questions live in `app/onboarding/questions.ts` (10 questions; `descricao_livre` is conditional on `contexto ∈ {Profissão, Estudo}`).

### Cron / scheduling

`app/api/cron/deliver/route.ts` requires `Authorization: Bearer $CRON_SECRET`. **The cron runs via GitHub Actions** (`.github/workflows/cron-deliver.yml`, schedule `45 * * * *` UTC) — NOT Vercel cron (`vercel.json` has `crons: []` to avoid the Hobby 1×/day limit). GH Actions needs repo secrets `APP_URL` + `CRON_SECRET`. GH Actions timing drifts 5-15min, so `isDue()` accepts a **±1h tolerance window**: a user's `horario` matches if it's in `[currentSpHour+1, currentSpHour, currentSpHour-1]` (SP = UTC-3). Idempotency via `last_delivered_at` + per-frequency `minIntervalMs` prevents duplicate sends. `horario` is parsed loosely (`08:00`, `8h`, `8` all → hour 8).

⚠️ Known limit: Vercel Hobby caps functions at 60s; the Tavily+DeepSeek pipeline runs ~35-70s, so with several users a cron run can time out. Mitigations for scale: Vercel Pro (300s), per-user pagination, or a more reliable external cron.

### Auth & RLS

Supabase Auth via `@supabase/ssr`. `middleware.ts` runs `getUser()` on every request to refresh tokens and gates `/onboarding`, `/settings`, `/dashboard`. RLS is enabled on `profiles`, `briefings`, `deliveries` — owners can read their own rows; writes from the pipeline use the **admin (service-role) client** which bypasses RLS. Never use the admin client in code that reaches the browser. `/api/admin/stats` is gated by matching `user.email === ADMIN_EMAIL`.

### Feedback & unsubscribe

The email contains `{{FEEDBACK_URL_YES}}` / `{{FEEDBACK_URL_NO}}` placeholders replaced just before send. `/api/feedback?id=&v=up|down` updates `deliveries.feedback`. `/api/unsubscribe?id=` supports both GET (HTML confirmation page) and POST (RFC 8058 one-click from Gmail/Outlook) and sets `profiles.is_active=false`.

## Conventions

- All user-facing copy, prompts, and log messages are **PT-BR**. The product voice ("amigo investido", dense self-contained summaries — not teasers) lives in `src/prompts/`.
- The codebase is single-tenant aware: scripts and admin client routinely operate on "the user with this email". Be careful before adding broadcast logic.
- When changing the schema, write a new file under `supabase/migrations/` (numbered) — migrations are applied by pasting into the Supabase SQL editor, not by a CLI.
- `output/`, `.next/`, `.env*`, and `fixtures/profile.json` are gitignored; CLI scripts write artifacts under `output/` freely.
