# NewsFlow AI

Curadoria de conteúdo personalizada por IA, entregue por email. O usuário define
seus interesses num onboarding, e recebe — na frequência e horário que escolher —
um email com os conteúdos mais relevantes e frescos sobre o que importa pra ele.

A voz do produto é de um "amigo investido": resumos densos e autocontidos (não
teasers), escritos como alguém que leu tudo e está te repassando o que importa.

---

## Stack & serviços externos

O produto depende de **7 serviços de runtime** + GitHub (repositório):

| Serviço | Função | Plano atual |
|---|---|---|
| **Vercel** | Hospedagem do site (Next.js) + deploy | Hobby (free) |
| **Supabase** | Banco de dados **+ autenticação** (magic link) | Free |
| **Resend** | Envio de emails (curadoria **e** magic links de login) | Free |
| **Serper** | Busca web — fonte **principal** (Google News, com data real) | Free/pago por uso (~US$0,30-1/1k buscas) |
| **Tavily** | `/extract` (texto completo pro corpo denso) + rede de segurança de busca | Free (1.000 créditos/mês) |
| **DeepSeek** | LLM — curadoria + conteúdo do email + normalização de tópicos | Pré-pago (créditos / top-up) |
| **cron-job.org** | Dispara o cron (bate em `/api/cron/deliver` a cada 30min) | Free |
| **GitHub** | Repositório do código (deploy automático na Vercel) | Free |
| **Stripe** | Assinatura (checkout, trial de 30 dias, cobrança recorrente) | Live em produção |

> **Dormente:** Gemini (`GEMINI_API_KEY`) ainda está nas envs como fallback, mas
> não é usado no pipeline atual. **PostHog** (funil de analytics) existe no código
> mas só ativa se `NEXT_PUBLIC_POSTHOG_KEY` estiver setada — hoje é opcional.

> **Pontos de atenção:** Resend e Supabase têm dupla função — se qualquer um cair,
> derruba 2 funcionalidades (envio + login no caso do Resend; dados + auth no Supabase).
> DeepSeek e Tavily são pré-pagos — monitore o saldo.

### Frameworks
Next.js 15 (App Router) · React 19 · Tailwind 4 · TypeScript

---

## Como funciona (pipeline)

```
cron-job.org (a cada 30min)
  → GET /api/cron/deliver (auth via CRON_SECRET)
      → Chamada agendada: responde 202 JÁ e processa em background (after()
        do Next 15) — evita falso-timeout no cron-job.org (curadoria leva
        ~25-40s, mais que o timeout de 30s dele).
      → Supabase: lê perfis ativos cujo horário bate (tolerância ±1h)
        + idempotência por período (não reenvia se já entregou no dia/janela)
      → Para cada usuário "due":
          1. Busca: Serper (principal, com data real) + Google News RSS
             (cobertura de nicho/local) em paralelo, mesclados. Tavily entra
             só como rede de segurança se os dois vierem muito pouco.
          2. Extract: texto completo (Tavily /extract) dos melhores
             candidatos sem corpo ainda — alimenta o corpo denso do email.
          3. UMA chamada DeepSeek: seleciona os melhores E escreve o conteúdo
             final (assunto, intro, corpo denso na voz "amigo investido",
             ~700-900 caracteres por item) → briefing
          4. Filtro de frescor: diário é estrito (ontem+hoje), cadências
             espaçadas usam uma janela maior. Degradação graciosa se faltar
             conteúdo fresco (evita email vazio) + dedup semântico entre
             edições (não repete história já enviada, mesmo reescrita)
          5. Validação leniente dos selecionados (só descarta link morto)
          6. Monta o HTML em código (template fixo, sem LLM)
          7. Resend envia
          8. Supabase grava o delivery + atualiza last_delivered_at
```

**Garantia anti-alucinação:** o LLM escolhe cada item pelo número do resultado
(não copia URL) — o código resolve pra URL/fonte/data reais. Data **sempre**
vem da fonte, nunca da inferência do LLM. Corpo nunca inventa números/nomes/
datas que não estejam no texto extraído.

**Curate + email foram fundidos em 1 chamada LLM** (era 2). O HTML é montado em
código (`src/lib/email-template.ts`), não pelo LLM — mais rápido, mais barato e
consistente.

**Frequências e itens por email:**

| Frequência | Frescor | Itens por email |
|---|---|---|
| Diária | estrito — ontem + hoje | 5-10 |
| A cada 3 dias | últimos ~6 dias | 7-15 |
| Semanal | últimos ~10 dias | 10-15 |

**Custo e tempo medidos (ago/2026):** ~R$ 0,03-0,08 por email (varia com nº de
itens e extração) · **pipeline ~10-30s** (busca ~1-2s + extract ~5-8s + DeepSeek
~15-20s + validação ~1s) — dentro do `maxDuration` de 180s da função.

---

## Estrutura do banco (Supabase)

| Tabela | O que guarda |
|---|---|
| `profiles` | Preferências do usuário (1 por usuário): nome, temas, tópicos (+ `topicos_busca`/`dominios_busca` derivados por LLM), referências, frequência, horário, idioma, `is_active`, `last_delivered_at`, `sample_cooldown_until` + campos de assinatura (`stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan`, `current_period_end`, `cancel_at_period_end`, `trial_end`, `comp_code`) |
| `briefings` | Conteúdo curado bruto (1 por execução): `itens` (JSONB), `meta` (custo, queries, provider) |
| `deliveries` | Email enviado (1 por envio): `subject`, `html`, `status`, `resend_id`, `feedback`, `briefing_id` |

Fluxo: `profiles` (config) → `briefings` (matéria-prima curada) → `deliveries` (email final).

**Gate de assinatura:** só recebe email quem tem `subscription_status` `active`
(pagante via Stripe, inclui trial) ou `manual` (cortesia/beta). `free`,
`past_due` e `canceled` são bloqueados (`src/lib/subscription.ts`).

---

## Setup local

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev                  # http://localhost:3000
```

Em modo dev (`NODE_ENV=development`), o login faz **bypass do email** — você digita
o email e é logado direto, sem precisar abrir magic link.

### Variáveis de ambiente
Veja `.env.example` para a lista completa. As críticas:
- `SERPER_API_KEY` — busca principal (sem ela, cai pra RSS+Tavily)
- `TAVILY_API_KEY`, `DEEPSEEK_API_KEY` — extract + rede de segurança / LLM
- `LLM_PROVIDER` / `CURATE_LLM_PROVIDER` / `EMAIL_LLM_PROVIDER` — `deepseek`
- `SEARCH_PROVIDER` — opcional, kill-switch (`serper`/`rss`/`tavily`); default = fan-out Serper+RSS
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`, `RESEND_FROM`
- `NEXT_PUBLIC_APP_URL` — usada nos links de feedback/unsubscribe
- `CRON_SECRET` — autentica o cron
- `ADMIN_EMAIL` — único email com acesso ao `/admin`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MENSAL`, `STRIPE_PRICE_ANUAL` — assinatura (produção)

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | Lint (`next lint`) |
| `npm run typecheck` | Checa tipos (tsc --noEmit) |
| `npm test` / `npm run test:watch` | Testes (Vitest) — lógica pura em `src/lib` |
| `npm run curate -- [perfil.json]` | Gera briefing via pipeline real (Serper/RSS+DeepSeek) |
| `npm run email -- [briefing.json] [dark] [locale]` | Monta o HTML do email a partir de um briefing (template, sem LLM) |
| `npm run send-test` | Envia `output/emails/latest` via Resend pra `TEST_EMAIL_TO` |
| `npm run deliver -- <email\|user_id> [--dry]` | Pipeline completo pra um usuário real do banco |
| `npm run preview -- [delivery_id]` | Abre o HTML de um delivery no browser |
| `npm run rederive-domains` | Re-deriva `dominios_busca` pra perfis pt com o campo vazio |
| `npm run reset-users` | ⚠️ Apaga TODOS os usuários e dados (reset do beta) |

---

## Deploy

- **Site:** push pra `main` → Vercel deploya automático.
- **Cron:** **cron-job.org** bate em `https://<app>/api/cron/deliver` a cada 30min,
  com header `Authorization: Bearer <CRON_SECRET>` configurado no dashboard dele.
  A chamada agendada (sem flags) responde 202 na hora e processa em background
  (Next 15 `after()`) — evita falso-timeout, já que a curadoria real leva mais
  que os 30s de timeout do cron-job.org. Chamadas manuais (`dry`/`force`/`user_id`)
  continuam síncronas. (GitHub Actions foi abandonado antes — descartava
  execuções silenciosamente.)
- **Migrações:** SQL em `supabase/migrations/`, aplicadas manualmente no SQL Editor
  do Supabase (não há CLI configurado).

### Disparar o cron manualmente
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<app>/api/cron/deliver?dry=1&force=1&user_id=<uuid>"
```
Flags: `dry=1` (não envia), `force=1` (ignora horário/frequência), `user_id=<uuid>` (1 usuário).

---

## Status

Produto em produção com assinantes reais (domínio próprio `trynewsflow.com`,
Stripe live com trial de 30 dias + cobrança recorrente, identidade visual
própria). Curadoria, entrega agendada, feedback, unsubscribe e painel admin
operacionais. Busca migrada de Tavily pra Serper como fonte principal (ago/2026)
após o Tavily degradar a taxa de resultados datados. Beta continua restrito a
um grupo pequeno de usuários enquanto valida qualidade/retenção antes de
marketing mais amplo.
