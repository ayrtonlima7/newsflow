import { defineConfig } from 'vitest/config';

// Testes de lógica pura (sem DOM). Foco em src/lib — funções determinísticas e
// load-bearing (janela de frequência, normalização de slug, gate de assinatura).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
});
