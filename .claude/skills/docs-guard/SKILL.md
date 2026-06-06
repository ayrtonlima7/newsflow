---
name: docs-guard
description: >-
  Mantém a documentação .md do NewsFlow (README.md e CLAUDE.md) em dia ao fim de
  qualquer feature/alteração que mude arquitetura, comandos, variáveis de ambiente,
  rotas, schema/migrations, serviços externos ou fluxos. Use ao FECHAR a tarefa —
  antes de considerar pronta. Gatilhos: "terminei a feature", "atualizar docs",
  "o README/CLAUDE.md está desatualizado?", ou ao adicionar comando npm, env var,
  migration, rota ou decisão de arquitetura.
---

# docs-guard — NewsFlow

Objetivo: o código nunca diverge da doc. Ao concluir uma mudança, atualizar
`README.md` e `CLAUDE.md` pra refletir o que mudou — nem a mais (sem inventar), nem
a menos.

## Quando rodar
Ao concluir qualquer tarefa que mexa em algo documentado. Rode ANTES de declarar a
tarefa pronta (junto do typecheck e da i18n-guard).

## O que cada doc cobre
- **`CLAUDE.md`** — guia técnico pra agentes: comandos (`## Commands`), arquitetura
  (split de diretórios, search+LLM, pipeline, frequência→janela, schema/perfil,
  cron/scheduling, auth/RLS, feedback/unsubscribe), convenções. É a fonte da verdade
  da arquitetura.
- **`README.md`** — visão do produto + setup. Mantém alinhado em alto nível.

## Gatilhos concretos → o que atualizar
Avalie o diff da tarefa (`git diff --stat main...` ou os arquivos tocados):

| Mudou… | Atualize em CLAUDE.md (e README se relevante) |
|---|---|
| Script em `package.json` (`scripts`) | bloco `## Commands` |
| Variável de ambiente nova/renomeada | `.env.example` **e** a menção na seção relevante; lista de serviços externos |
| Migration nova em `supabase/migrations/` | seção de schema/perfil + nota de "aplicar manualmente no SQL editor" |
| Rota/endpoint novo em `app/` | seção de diretórios/rotas e/ou cron/auth |
| Serviço externo (add/remove) | "External services" + contagem |
| Decisão de arquitetura (provider, pipeline, fluxo de auth, i18n) | a seção correspondente |
| Modelo de negócio (preço, trial, gating) | onde estiver descrito |

## Procedimento
1. **Liste o que a tarefa mudou** (arquivos + natureza: comando? env? migration?
   rota? arquitetura?).
2. **Abra `CLAUDE.md`** e localize as seções afetadas (use a tabela acima). Atualize
   com precisão — descreva o estado ATUAL, não o histórico. Remova o que ficou
   obsoleto.
3. **Abra `README.md`** e ajuste se a mudança for visível em alto nível (setup,
   serviços, proposta). Nem toda mudança técnica precisa entrar no README.
4. **Não invente**: só documente o que existe no código. Em dúvida sobre um detalhe,
   leia o arquivo-fonte antes de escrever.
5. **PT-BR** em toda a doc (convenção do projeto).
6. Se nada documentado mudou, declare explicitamente "docs já refletem a mudança" e
   siga — não force edição cosmética.

## NÃO documentar
- Segredos/valores reais de chaves (use placeholders; `.env.example` só com nomes).
- Detalhes efêmeros de implementação que não ajudam o próximo agente.
- Changelog verboso — a doc descreve o estado atual, não um diário.

## Checklist final
- [ ] Comandos novos/alterados refletidos em `## Commands`.
- [ ] Env vars novas em `.env.example` + mencionadas na seção certa.
- [ ] Migration nova citada na seção de schema.
- [ ] Rota/serviço/decisão de arquitetura refletidos na seção correspondente.
- [ ] README ajustado se a mudança for de alto nível.
- [ ] Nada inventado; tudo confere com o código.
