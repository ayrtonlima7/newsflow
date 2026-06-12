import { describe, it, expect } from 'vitest';
import { formatItemDate, renderEmailHtml } from './email-template';
import type { Briefing } from './types';

describe('formatItemDate', () => {
  it('formata por idioma (UTC, sem deslocar o dia)', () => {
    // formato exato varia com a versão do ICU; checa dia/mês/ano presentes.
    for (const loc of ['pt', 'en', 'es'] as const) {
      const out = formatItemDate('2026-06-12', loc);
      expect(out).toContain('12');
      expect(out).toContain('2026');
      expect(out.toLowerCase()).toContain('jun');
    }
  });

  it('retorna vazio pra data ausente/inválida', () => {
    expect(formatItemDate(undefined, 'pt')).toBe('');
    expect(formatItemDate('', 'pt')).toBe('');
    expect(formatItemDate('ontem', 'pt')).toBe('');
    expect(formatItemDate('2026-13-40', 'pt')).toBe('');
  });
});

describe('renderEmailHtml — data', () => {
  const base: Briefing = {
    data_referencia: '2026-06-12',
    assunto: 'Assunto',
    intro: 'Oi',
    itens: [],
  };

  it('exibe a data ao lado da fonte quando válida', () => {
    const html = renderEmailHtml(
      { ...base, itens: [{ titulo: 'T', fonte: 'g1', url: 'https://g1.com', data_publicacao: '2026-06-10', relevancia: 'Alta', corpo: 'c' }] },
      'pt',
    );
    expect(html).toContain('g1');
    expect(html).toMatch(/10 de jun/);
    expect(html).toContain('&middot;');
  });

  it('mostra só a fonte quando a data é inválida (sem "Invalid Date")', () => {
    const html = renderEmailHtml(
      { ...base, itens: [{ titulo: 'T', fonte: 'g1', url: 'https://g1.com', data_publicacao: '', relevancia: 'Alta', corpo: 'c' }] },
      'pt',
    );
    expect(html).toContain('g1');
    expect(html).not.toContain('Invalid Date');
    expect(html).not.toContain('&middot;');
  });
});
