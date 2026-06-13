# Analytics / funil (PostHog) — guia do módulo

Instrumentação do funil de aquisição pra responder **"até onde as pessoas vão
quando se deparam com o produto?"** — visita → onboarding → assinatura. Pensado
pra um **smoke test de anúncios**: comprar um pouco de tráfego e observar o
comportamento, sem ainda impulsionar o produto.

> **Estado: "dark" (env-gated).** O código está completo em produção mas
> **inerte** até você criar a conta no PostHog e setar `NEXT_PUBLIC_POSTHOG_KEY`.
> Sem a env, tudo é no-op — não coleta, não carrega script, não custa nada.

## Como funciona (camadas)

Duas camadas independentes e complementares:

| Camada | Ferramenta | Responde |
|---|---|---|
| **Trazer gente** | Google/Meta Ads (fora do código) | quantos viram/clicaram no anúncio |
| **Medir o funil** | **PostHog** (este módulo) | até onde foram DEPOIS do clique |

O PostHog mede o comportamento **dentro** do site. As plataformas de anúncio têm
pixels opcionais (Meta/Google) pra o conversion-tracking DELAS — também
env-gated aqui, mas o funil detalhado é do PostHog.

## O funil instrumentado

Topo → fundo. Cada evento vive em `src/lib/analytics/events.ts` (fonte da verdade):

| Evento | Onde dispara | Arquivo |
|---|---|---|
| `$pageview` (automático) | toda navegação (inclui landing + UTMs) | `app/_analytics/analytics-provider.tsx` |
| `signup_started` `{method}` | clique em Entrar (Google/email) | `app/login/login-form.tsx` |
| `onboarding_started` | abriu o wizard | `app/onboarding/wizard.tsx` |
| `onboarding_step` `{question_id, position, total_visible}` | chegou em **cada** pergunta | `app/onboarding/wizard.tsx` |
| `onboarding_completed` `{frequencia, n_topicos}` | confirmou/salvou o perfil | `app/onboarding/confirm-card.tsx` |
| `paywall_view` `{gate_state}` | viu os planos | `app/settings/subscription-card.tsx` |
| `checkout_started` `{plan}` | clicou em assinar (antes do Stripe) | `app/settings/subscription-card.tsx` |
| `subscribed` `{plan}` | assinatura criada (**server**, via webhook) | `app/api/stripe/webhook/route.ts` |

**`onboarding_step` é o ouro**: rastreado por `question_id` (não por índice,
porque há pergunta condicional `descricao_livre`). É o que desenha a curva de
drop-off por pergunta — quantos travam em cada uma.

## Arquitetura do módulo

```
src/lib/analytics/
  events.ts    ← catálogo (nomes + payloads). EDITE AQUI pra mudar o funil.
  track.ts     ← track()/identifyUser()/resetUser() client-side. No-op sem env.
  server.ts    ← trackServer() via HTTP, p/ eventos de servidor (subscribed).
app/_analytics/
  analytics-provider.tsx  ← init PostHog + $pageview + pixels de anúncio. No layout.
  identify-user.tsx       ← liga sessão anônima ao user.id. Nas páginas autenticadas.
```

**Princípios:**
- **No-op sem `NEXT_PUBLIC_POSTHOG_KEY`** — entra dark, ativa por env.
- **Type-safe** — `track(EVENT, payload)` exige o payload certo via `EventPayloads`.
- **Telemetria nunca quebra o app** — tudo em try/catch.
- **Sem camada multi-provider** (YAGNI). É PostHog + um catálogo editável.

### `identify` é o pino do funil

A sessão começa **anônima** (landing) e vira **identificada** no login. Sem o
`identifyUser(user.id)`, o PostHog trataria pré e pós-login como **duas pessoas**
e o funil quebraria no login. Por isso `IdentifyUser` é montado em **toda página
autenticada** (`/onboarding`, `/settings`) com o `user.id` vindo do server. O
evento `subscribed` (server) usa o mesmo `user.id` como `distinct_id` → cai na
mesma pessoa.

## Como ATIVAR (quando for rodar o teste)

1. Cria conta grátis no [PostHog](https://posthog.com) (free tier: 1M eventos/mês,
   sem cartão). Escolhe região US ou EU.
2. Pega a **Project API Key** (`phc_...` — é **pública** de propósito, vai no client).
3. Seta na Vercel (Production) e no `.env.local`:
   - `NEXT_PUBLIC_POSTHOG_KEY=phc_...`
   - `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com` (ou `eu.i.posthog.com`)
4. Redeploy (push no git — **não** `vercel redeploy` de deploy antigo).
5. No PostHog, cria um **Funnel** com os passos acima na ordem → vê o drop-off.

### Pixels de anúncio (opcional, quando for ligar anúncios)
- `NEXT_PUBLIC_META_PIXEL_ID` — só se anunciar no Meta (Instagram/Facebook).
- `NEXT_PUBLIC_GOOGLE_ADS_ID` — `AW-XXXX` (Ads) ou `G-XXXX` (GA4) p/ Google.

### UTMs nos links do anúncio (atribuição)
O PostHog captura UTMs no 1º pageview automaticamente. Pra saber **de qual
anúncio** veio cada pessoa, os links do anúncio precisam carregar UTMs:
```
https://trynewsflow.com/?utm_source=meta&utm_medium=cpc&utm_campaign=smoke-test-1
```

## Limitações conhecidas (ler antes de interpretar os números)

- **Magic-link cross-device**: se a pessoa abre o link do email em outro
  aparelho, aquela sessão é um novo anônimo que não costura com a visita da
  landing → `landing → signup` **subconta** pra quem usa email. Durante o teste,
  prefira destacar o **Google OAuth** (mesmo browser, costura certo).
- **`signup_started` dispara logo antes de navegar pra fora** (OAuth do Google /
  envio do magic-link). O PostHog tenta dar flush via `sendBeacon` no
  `pagehide`, mas em redirect imediato o evento pode não sair → `signup_started`
  pode **subcontar**. Trate a queda landing→signup como direcional, não como
  abandono real.
- **Adblockers** comem parte dos eventos do PostHog-cloud e dos pixels → dados
  são **direcionais**, não exatos. Suficiente pra smoke test; não trate como censo.
- **`person_profiles: 'identified_only'`** — só cria perfil de pessoa após o
  identify (mais barato, melhor p/ LGPD). Eventos anônimos ainda contam no funil.
- **Sem `reset()` no logout** (ainda): em browser compartilhado, dois usuários
  podem se misturar. Baixo risco no teste (visitantes de anúncio são novos).
- **`subscribed` depende do Stripe live** — a conta está em revisão; o evento de
  fundo de funil só dispara quando houver assinatura real. Até lá,
  `checkout_started` é o fim de funil mensurável.
- **LGPD**: tráfego real no Brasil → quando sair do smoke test, avaliar banner de
  consentimento. PostHog pode rodar cookieless se necessário.
