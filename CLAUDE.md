# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Next production build
npm run start        # Next production server
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run (testes de lógica pura em src/lib; *.test.ts colocados)
npm run test:watch   # vitest em watch (dev)
```

CLI pipeline scripts (all via `tsx`, load `.env.local` then `.env`):

```bash
npm run curate -- [path/to/profile.json]   # generate briefing → output/briefings/{stamp,latest}.json
npm run email  -- [path/to/briefing.json]  # render HTML email from briefing → output/emails/latest/
npm run send-test                          # send output/emails/latest via Resend to TEST_EMAIL_TO
npm run deliver -- <email|user_id> [--dry] # full pipeline for a real DB user (writes briefings/deliveries rows)
npm run preview -- [delivery_id]           # save a delivery's HTML to output/previews/ and open it
npm run reset-users                        # ⚠️ deletes ALL auth users + cascades (profiles/briefings/deliveries). Beta reset.
npm run rederive-domains                   # re-derive dominios_busca for pt profiles that are null/empty (dry-run optional)
```

Cron endpoint (manual trigger for testing):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/deliver?dry=1&force=1&user_id=<uuid>"
# Flags: dry=1 (skip Resend), force=1 (ignore schedule/idempotency), user_id=<uuid> (limit to one user)
```

## Architecture

Next.js 15 App Router + React 19 + Tailwind 4 + Supabase + Resend. **Search via Tavily, LLM via DeepSeek.** TS path alias `@/*` resolves to repo root.

**External services (6 active):** Vercel (host) · Supabase (DB + auth) · Resend (email send + auth magic-link relay) · Tavily (web search) · DeepSeek (LLM) · cron-job.org (hourly cron, external). Gemini is dormant (key kept as fallback, not used). DeepSeek is **prepaid** (top-up balance) — if it hits zero, the pipeline fails (monitor it). **PostHog** (analytics/funnel) is a 7th service but **dormant/env-gated** — code ships dark, activates only when `NEXT_PUBLIC_POSTHOG_KEY` is set (see Analytics below).

### Directory split

- `app/` — Next routes, server actions, pages (`/login`, `/onboarding`, `/settings`, `/admin`, plus `app/api/*` and `app/auth/confirm`). `app/api/dev/preview/[id]` serves delivery HTML in dev only. `app/_analytics/` holds the client analytics provider + identify component (see Analytics).
- `src/` — non-Next code: `cli/` scripts, `prompts/` (just `curate.ts`), `lib/` (pipeline, delivery, providers, **search**, **email-template**, types, pricing, url-validation, topic-normalization, domain-derivation, admin-stats, **analytics/**).
- `lib/supabase/` — three Supabase clients (browser, server-RSC, admin/service-role). Path is `@/lib/supabase/...`.
- `supabase/migrations/` — SQL migrations applied manually via Supabase SQL editor. `supabase/scripts/` — one-off SQL (e.g. reset).
- `fixtures/` — sample profile JSON for local CLI runs.

### Search + LLM split (the big architectural decision)

**Curate does NOT use LLM web search.** Web search is delegated to **Tavily** (`src/lib/search.ts`), then DeepSeek curates the real results. This solves two problems at once: (1) URLs are real (from Tavily's index, not LLM-generated → no hallucination), (2) freshness is enforced via Tavily's `topic:news` + `days` params.

`getProvider(name?)` returns an `LLMProvider` with unified `complete()` and a `supportsWebSearch` flag. Selection order: explicit arg → `LLM_PROVIDER` env → `'gemini'` (but `LLM_PROVIDER=deepseek` in practice). Anthropic is stubbed (removed from deps). Provider usage:

- **Curate** uses `CURATE_LLM_PROVIDER` → `LLM_PROVIDER` (DeepSeek). No web search — it receives Tavily results.
- **Topic normalization** uses `NORMALIZE_LLM_PROVIDER` → `EMAIL_LLM_PROVIDER` → `LLM_PROVIDER`.
- Email generation does **NOT** call an LLM anymore (see Pipeline below) — the HTML is built in code.

`extractJson()` strips fences and brace-matches the first JSON object/array — providers wrap JSON in markdown despite instructions. `jsonMode: true` is used for the curate call.

### Pipeline (`src/lib/pipeline.ts` + `src/lib/delivery.ts`)

Curate and email generation were **merged into a single LLM call** (was 2). `generateBriefing(profile)`:
1. **Tavily search** — `buildSearchQueries(profile, locale)` makes 1 query per topic (cap 6); `tavilySearchMany()` runs them in parallel, dedupes by URL. `topic:news`, `days = janela.janelaDias`. **Each query gets a news-intent word appended** (`withNewsIntent`: pt `notícias` / en `news` / es `noticias`, idempotent) — bare proper nouns ("Botafogo") match Tavily's *evergreen/old* fixture pages (2018 match listings) that the freshness filter then drops → empty briefing; "Botafogo notícias" surfaces recent articles (measured: 0 → 6 fresh items). Neutral on broad topics. **For `pt` users, search is restricted to a list of Brazilian domains (`include_domains`)** — Tavily's news index is global/English-biased and returns junk (FOX Sports, NBA) for local topics without it. The domain list is resolved by `resolveDomains()`: **dynamic per-profile list** (`profile.dominios_busca`, derived by LLM on profile save) → **static fallback** (`DOMAINS_BY_LOCALE['pt']`, ~100 domains: Brazilian, Portuguese/lusophone, and international outlets with Portuguese editions) → **undefined** for en/es (no restriction). `topic-normalization.ts` also strips social-handle framing ("(Twitter/Instagram)", "Podcast X") into searchable news queries. **Cross-delivery dedup**: `generateBriefing(profile, { excludeUrls })` filters out URLs the user already received in recent editions (the set is built in `delivery.ts` from the user's briefings within the last `janelaDias` days) **before** the LLM sees them — so it picks fresh alternatives instead of re-selecting the same still-relevant article. Better fewer-but-new than repeats.
2. **One DeepSeek call** — `buildCurateFromResultsPrompt()` passes ALL raw Tavily results; the LLM selects the best AND writes the final content in the "amigo investido" voice: `assunto` (subject), `intro` (greeting), and per item `{titulo, fonte, url, data_publicacao, relevancia, corpo}` where `corpo` is the voiced 6-10 line body (relevance woven in). **No HTML is generated by the LLM.**
3. **Anti-hallucination guard** — items whose URL is NOT in the Tavily result set are dropped (the model may only use provided URLs).
   - **Date cross-validation**: when Tavily returned a `published_date` for an item, it overwrites the LLM's extracted date (ground truth). When Tavily has *no* date, the LLM's date is left as-is — **we do NOT null/drop it** (an earlier heuristic that nulled "today" dates was over-dropping genuinely-fresh news; that was the bug behind near-empty briefings).
4. **Freshness backstop** — `filterByFreshness()` classifies items into three buckets: **`datedFresh`** (valid `data_publicacao` within the window — always kept), **`staleDropped`** (valid date older than cutoff — dropped), and **`undated`** (missing/malformed date). Undated items are **kept only as filler** to reach `itemsMin` (preferred items are the dated-fresh ones); on a full day they're dropped. This fixes evergreen/undated essays (e.g. geopolitics "análise" pieces with no date) dominating an edition and reading as stale, while keeping recall on a thin day. The cutoff uses a **grace buffer** (`GRACE_DIAS = 3` in `frequenciaParaJanela`) — the backstop is meant to cut content that's *weeks/years* old, not trim 2-day-old news on a daily cadence.
5. **Lenient link validation** — `validateSelectedLeniently()` HEAD-checks ONLY the ~7 selected items (not all 32) with a browser UA, AFTER selection. Drops only genuinely dead links (404/410/DNS-fail/refused); **keeps 403/401/timeout** (sites that block bots but open fine in a browser → avoids false-negatives). This is fast (~1s).

`generateEmail(profile, briefing)` does **NOT call an LLM** — it just runs `renderEmailHtml(briefing, locale)` (`src/lib/email-template.ts`), a fixed HTML template with `{{FEEDBACK_URL_YES/NO}}` placeholders. Each item shows **`fonte · data`** (the publish date via `formatItemDate()`, locale-aware through `Intl`/`INTL_LOCALE`, UTC to avoid day-shift; omitted when the date is missing/invalid — never "Invalid Date"). Returns `{ assunto, html }`. This is the base for the visual identity work.

`runDeliveryPipeline()` (in `delivery.ts`) orchestrates against the DB: inserts `briefings` row, then `deliveries` row (`pending` → `sent`/`failed`/`skipped`), substitutes the feedback placeholders, sends via Resend (with `List-Unsubscribe` RFC 8058 headers), updates `profiles.last_delivered_at`. Cost (~R$0.020/email measured; one LLM call only) stored in `briefings.meta`.

**Measured perf:** full pipeline ~22s (Tavily ~1s + DeepSeek curate ~18s + validation ~1s). The `[timing]` console logs print each phase.

### Frequency → window & item count (`frequenciaParaJanela` in `types.ts`)

| `frequencia` | base | janelaDias (base + grace) | itemsMin–Max |
|---|---|---|---|
| "Todo dia" (daily) | 1 | 4 | 5–8 |
| "A cada 3 dias" | 3 | 6 | 7–10 |
| "Uma vez por semana" | 7 | 10 | 10–15 |

`janelaDias` = cadence base + `GRACE_DIAS` (3), and feeds both Tavily's `days` and the freshness cutoff. The grace exists because a strict 24h window (daily) plus the timezone slop in Tavily's `published_date` was dropping most fresh items → near-empty briefings; the freshness filter is a backstop against *very old* content, not a precise recency gate. Item counts (driven by the base cadence) scale so frequent emails are leaner, spaced ones denser.

### Profile shape — onboarding redesign (migration 0003)

The onboarding was redesigned from "professional-centric" (area/cargo/tom) to "interest-centric". **The old columns `area`, `cargo`, `fontes_prioritarias`, `tom`, `descricoes_livres` were DROPPED in migration 0003.** Current `Profile` fields: `nome`, `tema[]`, `contexto[]`, `descricao_livre`, `objetivo[]`, `topicos[]`, `topicos_busca[]`, `dominios_busca[]`, `referencias[]`, `formatos[]`, `ignorar[]`, `frequencia`, `horario`. **`contexto` and `objetivo` are multi-select arrays** (migration 0012, `text → text[]`); `contexto` stores slugs (`profession`/`study`/`hobby`/`curiosity`) — see `src/lib/onboarding-options.ts`.

`topicos` is what the user typed; `topicos_busca` is the LLM-normalized version (`topic-normalization.ts`, generated on save) used for search queries to avoid temporal markers / typos. `dominios_busca` is the LLM-derived list of BR news domains for that profile (`domain-derivation.ts`, generated on save, ~50 target, no floor). Both derived fields are computed on profile save and run in parallel via `Promise.all`. `profileForPrompt()` in `src/lib/types.ts` swaps `topicos` for `topicos_busca` and shapes the object for prompts — **always use it**, never pass raw `Profile` to an LLM. Onboarding questions live in `app/onboarding/questions.ts` — `getQuestions(locale)` (i18n); `descricao_livre` is conditional on `contexto` containing `profession` or `study`.

### Domain derivation (`src/lib/domain-derivation.ts`)

On profile save (onboarding + settings), `deriveDomains(profile)` calls **DeepSeek** (`DERIVE_DOMAINS_MODEL`, default `deepseek-chat`) to map the user's topics/context/objectives → a subset of Brazilian news domains from a curated catalog (same 35 domains as the static list, organized by vertical). Key facts:

- **Runs 1× per profile save**, not per delivery. Runs in parallel with `normalizeTopics()` via `Promise.all`.
- **Target ~50 domains** (catalog has ~100; the LLM can include domains outside the catalog — logged as warnings but kept). No minimum floor.
- **Robust to model swap**: tries `DERIVE_DOMAINS_MODEL` first, then auto-falls-back to **`deepseek-chat`** if that model returns empty `content` or errors (`resolveDeriveModels()` builds the ordered list, no-dup when they're equal). A model that returns empty no longer silently kills the feature — it recovers before giving up to the static list.
- **JSON mode is model-aware** (`isReasonerModel()`): non-reasoner models (`deepseek-chat`, `deepseek-v4-flash/pro`) get `response_format: json_object` for a predictable reply; reasoners (`deepseek-reasoner`/R1) do **not** (they don't support it — the answer would go to `reasoning_content` and leave `content` empty), relying on the prompt's "JSON only" instruction + `extractJson`. ⚠️ The old code dropped `response_format` for *all* models, which is why `deepseek-v4-flash` returned empty `content` and fell to the static list.
- **Fail-open**: returns `null` only when *no* model produces a usable list (missing key, all models empty/errored). The pipeline falls back to the static `DOMAINS_BY_LOCALE['pt']` (~100 domains).
- **pt-only**: en/es return `null` immediately (no domain restriction).
- **Consumed by** `resolveDomains()` in `pipeline.ts`: `profile.dominios_busca` → static list → `undefined`.
- **Standalone client**: creates its own OpenAI client pointing to DeepSeek (same `DEEPSEEK_API_KEY`, different model). Does NOT use `getProvider()` — keeps the model override isolated.
- **Env var**: `DERIVE_DOMAINS_MODEL` (default `deepseek-chat`; `deepseek-v4-flash`/`pro` also work). ⚠️ **`deepseek-reasoner` is a bad fit here** — at `max_tokens: 4096` the CoT eats the budget and `content` comes back empty (measured: ~3.5k chars of reasoning, empty content, 9.5s wasted). If you must use it, the chat fallback recovers, but you pay a wasted reasoner call. Set in Vercel env (production) — not in `.env.example` as active, only documented.
- **Migration**: `0013_dominios_busca.sql` adds the `dominios_busca text[]` column + backfills with the static list for existing pt profiles.

### Cron / scheduling

`app/api/cron/deliver/route.ts` requires `Authorization: Bearer $CRON_SECRET`. **The cron runs via cron-job.org** (external service, free, hits the endpoint every 30min with the Authorization header configured in its dashboard). It replaced GitHub Actions, which **silently dropped scheduled runs** (best-effort, unreliable). `vercel.json` has `crons: []` (no Vercel cron — Hobby caps at 1×/day). The GH Actions workflow (`.github/workflows/cron-deliver.yml`) still exists but should be disabled.

`isDue()` logic:
- **Hour match, on-time-or-late (never early)**: user's `horario` matches if it's in `[currentSpHour, currentSpHour-1]` (SP = UTC-3) — i.e. delivered at the target hour or up to 1h late if that run was missed, **never before**. (An earlier `+1` term fired 1h early — a 7h user got the email at 6h; removed.) `horario` parsed loosely (`08:00`, `8h`, `8` → 8).
- **Idempotency by calendar period** (`alreadyDeliveredThisPeriod`): daily → already delivered same SP calendar day; 3-day → within 2.5 days; weekly → within 6 days. This is by PERIOD, not "X hours since last" — so a manual test yesterday doesn't block today's scheduled send.

⚠️ Known limits:
- cron-job.org free tier has a **30s request timeout**. The pipeline now runs ~22s (after the curate+email merge), under the limit. If it creeps back up, cron-job.org marks "timeout" but the Vercel function still completes (email sends) — idempotency prevents a duplicate on retry.
- Vercel Hobby caps functions at 60s. At ~22s/user **sequential**, 2 users at the same hour ≈ 44s (ok), 3+ risks timeout. Fix for scale: per-user invocation (fan-out) or a queue (Upstash QStash).

### Auth & RLS

Supabase Auth via `@supabase/ssr`. **Login is unified on the home page (`/`)** — the landing pitch + the `LoginForm` (Google OAuth + email magic-link) render together; `/login` is now just a redirect to `/` (preserves `next`/`error`). An authenticated user hitting `/` is redirected to `/settings`. `middleware.ts` runs `getUser()` on every request to refresh tokens and gates `/onboarding`, `/settings`, `/dashboard` — unauthenticated hits redirect to `/?next=<path>`. RLS is enabled on `profiles`, `briefings`, `deliveries` — owners can read their own rows; writes from the pipeline use the **admin (service-role) client** which bypasses RLS. Never use the admin client in code that reaches the browser. `/api/admin/stats` is gated by matching `user.email === ADMIN_EMAIL`.

### Feedback & unsubscribe

The email contains `{{FEEDBACK_URL_YES}}` / `{{FEEDBACK_URL_NO}}` placeholders replaced just before send. `/api/feedback?id=&v=up|down` updates `deliveries.feedback`. `/api/unsubscribe?id=` supports both GET (HTML confirmation page) and POST (RFC 8058 one-click from Gmail/Outlook) and sets `profiles.is_active=false`.

### Analytics / funil (PostHog) — **env-gated, ships dark**

Acquisition-funnel instrumentation for an ad smoke test ("how far do people get?"). **Full guide: `docs/ANALYTICS.md`.** The whole thing is **no-op without `NEXT_PUBLIC_POSTHOG_KEY`** — it ships inert and activates by setting the env (no code change). Never blocks the app (all calls in try/catch).

- **Module:** `src/lib/analytics/` — `events.ts` (the typed event catalog = source of truth; edit here to change the funnel), `track.ts` (client `track()`/`identifyUser()`/`resetUser()`), `server.ts` (`trackServer()` via HTTP for server events, no posthog-node dep). `app/_analytics/` — `analytics-provider.tsx` (PostHog init + manual `$pageview` on route change + optional Meta/Google ad pixels, all env-gated; mounted in `layout.tsx`) and `identify-user.tsx` (mounted on authed pages).
- **Funnel events:** `signup_started` (login-form) → `onboarding_started` + `onboarding_step` (wizard) → `onboarding_completed` (confirm-card) → `paywall_view` + `checkout_started` (subscription-card) → `subscribed` (webhook, **server**). Always import names from `ANALYTICS_EVENTS`, never raw strings. `onboarding_step` is keyed by **`question_id`** (not index — conditional questions shift the index) → that's the drop-off-by-question signal.
- **`identify` is load-bearing:** `IdentifyUser` runs on every authed page (`/onboarding`, `/settings`) with `user.id` from the server — without it the funnel severs at login (anon vs identified treated as 2 people). The server `subscribed` event uses the same `user.id` as `distinct_id` so it lands on the same person.
- **Envs (all optional):** `NEXT_PUBLIC_POSTHOG_KEY` (public `phc_...`), `NEXT_PUBLIC_POSTHOG_HOST` (us/eu), `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`.
- **Known limits:** magic-link cross-device under-counts `signup` (prefer Google OAuth during tests); adblockers eat events (data is directional); no `reset()` on logout yet; `subscribed` only fires once Stripe is live (use `checkout_started` as end-of-funnel meanwhile).

## Conventions

- All user-facing copy, prompts, and log messages are **PT-BR**. The product voice ("amigo investido", dense self-contained summaries — not teasers) lives in `src/prompts/`.
- The codebase is single-tenant aware: scripts and admin client routinely operate on "the user with this email". Be careful before adding broadcast logic.
- When changing the schema, write a new file under `supabase/migrations/` (numbered) — migrations are applied by pasting into the Supabase SQL editor, not by a CLI.
- `output/`, `.next/`, `.env*`, and `fixtures/profile.json` are gitignored; CLI scripts write artifacts under `output/` freely.
