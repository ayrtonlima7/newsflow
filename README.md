# NewsFlow AI

Curadoria de conteúdo personalizada por IA, entregue por email. O usuário define
seus interesses num onboarding, e recebe — na frequência e horário que escolher —
um email com os conteúdos mais relevantes e frescos sobre o que importa pra ele.

A voz do produto é de um "amigo investido": resumos densos e autocontidos (não
teasers), escritos como alguém que leu tudo e está te repassando o que importa.

---

## Stack & serviços externos

O produto depende de **6 serviços externos** ativos:

| Serviço | Função | Plano atual |
|---|---|---|
| **Vercel** | Hospedagem do site (Next.js) + deploy | Hobby (free) |
| **Supabase** | Banco de dados **+ autenticação** (magic link) | Free |
| **Resend** | Envio de emails (curadoria **e** magic links de login) | Free |
| **Tavily** | Busca web (acha os artigos reais e frescos) | Free (1.000 buscas/mês) |
| **DeepSeek** | LLM — curadoria, geração do email, normalização de tópicos | Pré-pago (créditos / top-up) |
| **GitHub** | Repositório + **GitHub Actions** (dispara o cron de hora em hora) | Free |

> **Dormente:** Gemini (`GEMINI_API_KEY`) ainda está nas envs como fallback, mas
> não é usado no pipeline atual.

> **Pontos de atenção:** Resend e Supabase têm dupla função — se qualquer um cair,
> derruba 2 funcionalidades (envio + login no caso do Resend; dados + auth no Supabase).

### Frameworks
Next.js 15 (App Router) · React 19 · Tailwind 4 · TypeScript

---

## Como funciona (pipeline)

```
GitHub Actions (cron, a cada hora no minuto 45 UTC)
  → POST /api/cron/deliver (auth via CRON_SECRET)
      → Supabase: lê perfis ativos cujo horário bate (janela de tolerância ±1h)
      → Para cada usuário "due":
          1. Tavily busca (1 query por tópico) → artigos reais + datas
          2. Valida que os links abrem (UA de browser) → descarta quebrados
          3. DeepSeek seleciona os melhores + escreve resumos densos → briefing
          4. Filtro de frescor (descarta fora da janela de tempo)
          5. DeepSeek gera o HTML do email
          6. Resend envia
          7. Supabase grava o delivery + atualiza last_delivered_at
```

**Garantia anti-alucinação:** o LLM só pode usar URLs que vieram da Tavily. Se
inventar um link, é descartado. Por isso os links sempre são reais.

**Frequências e janelas de frescor:**

| Frequência | Janela de busca | Itens por email |
|---|---|---|
| Diária | últimas 24h | 5-8 |
| A cada 3 dias | últimos 3 dias | 7-10 |
| Semanal | últimos 7 dias | 10-15 |

**Custo medido:** ~R$ 0,035 por email (só DeepSeek; Tavily no free tier).

---

## Estrutura do banco (Supabase)

| Tabela | O que guarda |
|---|---|
| `profiles` | Preferências do usuário (1 por usuário): nome, temas, tópicos, referências, frequência, horário, `is_active`, `last_delivered_at` |
| `briefings` | Conteúdo curado bruto (1 por execução): `itens` (JSONB), `meta` (custo, queries, provider) |
| `deliveries` | Email enviado (1 por envio): `subject`, `html`, `status`, `resend_id`, `feedback`, `briefing_id` |

Fluxo: `profiles` (config) → `briefings` (matéria-prima curada) → `deliveries` (email final).

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
- `TAVILY_API_KEY`, `DEEPSEEK_API_KEY` — IA + busca
- `LLM_PROVIDER` / `CURATE_LLM_PROVIDER` / `EMAIL_LLM_PROVIDER` — `deepseek`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`, `RESEND_FROM`
- `NEXT_PUBLIC_APP_URL` — usada nos links de feedback/unsubscribe
- `CRON_SECRET` — autentica o cron
- `ADMIN_EMAIL` — único email com acesso ao `/admin`

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run typecheck` | Checa tipos (tsc --noEmit) |
| `npm run curate -- [perfil.json]` | Gera briefing via CLI (fixtures/profile.json) |
| `npm run email -- [briefing.json]` | Renderiza email a partir de um briefing |
| `npm run deliver -- <email\|user_id> [--dry]` | Pipeline completo pra um usuário real do banco |
| `npm run preview -- [delivery_id]` | Abre o HTML de um delivery no browser |
| `npm run reset-users` | ⚠️ Apaga TODOS os usuários e dados (reset do beta) |

---

## Deploy

- **Site:** push pra `main` → Vercel deploya automático.
- **Cron:** GitHub Actions (`.github/workflows/cron-deliver.yml`) roda no minuto 45
  de cada hora. Precisa dos secrets `APP_URL` e `CRON_SECRET` no repositório.
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

MVP funcional em produção (beta privado). Curadoria, entrega agendada, feedback,
unsubscribe e painel admin operacionais. Próximas frentes: domínio próprio,
sistema de assinatura (Stripe), identidade visual.
