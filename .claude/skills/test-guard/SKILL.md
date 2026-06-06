---
name: test-guard
description: >-
  Garante cobertura de testes (Vitest) pra lógica nova/alterada no NewsFlow ao fim
  de uma feature. Use ao FECHAR a tarefa, antes de declarar pronta. Foca em lógica
  PURA e determinística (funções em src/lib) — especialmente regras load-bearing
  (janela de frequência, normalização de slug, gate de assinatura, pricing,
  url-validation). Gatilhos: "terminei a feature", "escrever testes", "tem teste
  pra isso?", ou ao criar/alterar função pura em src/lib.
---

# test-guard — NewsFlow

Objetivo: lógica crítica nunca regride sem aviso. Toda função pura nova/alterada
ganha (ou estende) um teste Vitest colocado ao lado dela.

## Stack
- **Vitest** (`npm test` = `vitest run`; `npm run test:watch` no dev).
- Config: `vitest.config.ts` (env `node`, inclui `src/**/*.test.ts` e `app/**/*.test.ts`).
- Testes COLOCADOS: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Import relativo (`./foo`).

## O que testar (e o que NÃO)
**Teste (alto valor, baixo custo):**
- Funções **puras e determinísticas** em `src/lib/`: transformações, normalização,
  cálculo de janela/datas, gating, pricing, parsing/validação.
- Regras **load-bearing** — onde um bug é silencioso e caro: `frequenciaParaJanela`,
  `normalizeFrequencia`/`normalizeContexto`, `canDeliver`/`isPaid`, `frequenciaParaJanela`,
  `extractJson`, filtros de frescor.
- Casos de borda: vazio/null, legado (rótulos PT antigos), entradas inválidas.

**NÃO teste agora (custo/benefício ruim sem mocking pesado):**
- Server actions, route handlers, componentes React/RSC (precisam de mock de
  Supabase/Stripe/Resend/Next) — a menos que extraia a lógica pura pra uma função
  testável.
- Chamadas de rede reais (Tavily/DeepSeek/Resend/Stripe). Se precisar, isole atrás
  de uma função e teste o puro; mocke a borda.
- Datas absolutas frágeis: prefira asserções relativas (`cutoffISO < todayISO`).

## Procedimento
1. **Liste a lógica pura nova/alterada** na tarefa (funções exportadas em `src/lib`
   tocadas pelo diff).
2. Pra cada uma: crie/estenda o `*.test.ts` colocado. Cubra o caminho feliz + 1-2
   bordas + qualquer regra de tolerância (ex: aceitar slug E legado).
3. Se a feature mudou comportamento de uma função JÁ testada, **atualize o teste**
   pra refletir o novo contrato (não deixe teste velho passando por engano).
4. Rode `npm test`. Tudo verde antes de fechar.
5. Se a lógica está presa dentro de um componente/action e vale testar, **extraia**
   pra uma função pura em `src/lib` e teste essa função (melhora o design também).

## Padrão de um teste
```ts
import { describe, it, expect } from 'vitest';
import { minhaFuncao } from './meu-modulo';

describe('minhaFuncao', () => {
  it('caminho feliz', () => { expect(minhaFuncao('x')).toBe('y'); });
  it('borda: vazio/null', () => { expect(minhaFuncao('')).toBe(/* default */); });
});
```

## Checklist final
- [ ] Cada função pura nova/alterada em src/lib tem teste colocado.
- [ ] Regras load-bearing cobertas (incl. tolerância a legado, se houver).
- [ ] Testes de funções com contrato alterado foram atualizados.
- [ ] `npm test` passa (verde).
