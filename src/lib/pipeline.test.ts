import { describe, it, expect } from 'vitest';
import { filterByFreshness, dedupeItems, sortByRecencyDesc, sanitizeCorpo, sortForDisplay, reabsorbFromGrace, normalizeTitleForDedup } from './pipeline';
import type { BriefingItem } from './types';

function item(titulo: string, data_publicacao: string): BriefingItem {
  return {
    titulo,
    fonte: 'fonte',
    url: `https://ex.com/${titulo}`,
    data_publicacao,
    relevancia: 'Alta',
    corpo: 'corpo',
  };
}

describe('filterByFreshness', () => {
  const cutoff = '2026-06-08';

  it('separa datado-fresco, sem-data e stale', () => {
    const itens = [
      item('fresco', '2026-06-10'),
      item('no-limite', '2026-06-08'), // == cutoff → mantém (não é < cutoff)
      item('antigo', '2026-06-01'),
      item('sem-data', ''),
      item('data-ruim', 'ontem'),
    ];
    const r = filterByFreshness(itens, cutoff);
    expect(r.datedFresh.map((i) => i.titulo)).toEqual(['fresco', 'no-limite']);
    expect(r.undated.map((i) => i.titulo)).toEqual(['sem-data', 'data-ruim']);
    expect(r.staleDropped.map((d) => d.item.titulo)).toEqual(['antigo']);
  });

  it('item sem data nunca vira stale (vai pra undated)', () => {
    const r = filterByFreshness([item('x', '')], cutoff);
    expect(r.staleDropped).toHaveLength(0);
    expect(r.undated).toHaveLength(1);
  });
});

describe('sortByRecencyDesc', () => {
  it('ordena do mais novo pro mais antigo', () => {
    const out = sortByRecencyDesc([
      item('antigo', '2026-06-01'),
      item('novo', '2026-06-18'),
      item('meio', '2026-06-10'),
    ]);
    expect(out.map((i) => i.titulo)).toEqual(['novo', 'meio', 'antigo']);
  });

  it('afunda itens sem data pro fim', () => {
    const out = sortByRecencyDesc([
      item('sem-data', ''),
      item('datado', '2026-06-15'),
    ]);
    expect(out.map((i) => i.titulo)).toEqual(['datado', 'sem-data']);
  });

  it('não muta a entrada', () => {
    const entrada = [item('a', '2026-06-01'), item('b', '2026-06-18')];
    const copia = [...entrada];
    sortByRecencyDesc(entrada);
    expect(entrada.map((i) => i.titulo)).toEqual(copia.map((i) => i.titulo));
  });
});

describe('reabsorbFromGrace', () => {
  const drop = (titulo: string, data: string) => ({
    item: { titulo, fonte: 'f', url: `https://ex.com/${titulo}`, data_publicacao: data, relevancia: 'Alta' as const, corpo: 'c' },
    reason: 'antigo',
  });
  // diário: estrito=ontem (06-18), folga até 06-15
  const opts = { cutoffISO: '2026-06-18', cutoffGraceISO: '2026-06-15', itemsMin: 3 };

  it('reabsorve da folga (mais novo primeiro) quando faltam recentes', () => {
    const datedFresh = [item('hoje', '2026-06-19')]; // só 1 recente, min 3
    const stale = [drop('d16', '2026-06-16'), drop('d17', '2026-06-17'), drop('d13', '2026-06-13')];
    const r = reabsorbFromGrace(datedFresh, stale, opts);
    // precisa de +2; pega 06-17 e 06-16 (na folga, mais novos); 06-13 fica stale
    expect(r.datedFresh.map((i) => i.titulo)).toEqual(['hoje', 'd17', 'd16']);
    expect(r.trulyStale.map((d) => d.item.titulo)).toEqual(['d13']);
    expect(r.reabsorbed).toHaveLength(2);
  });

  it('não reabsorve se já há itens suficientes', () => {
    const datedFresh = [item('a', '2026-06-19'), item('b', '2026-06-18'), item('c', '2026-06-18')];
    const r = reabsorbFromGrace(datedFresh, [drop('d16', '2026-06-16')], opts);
    expect(r.reabsorbed).toHaveLength(0);
    expect(r.trulyStale).toHaveLength(1);
  });

  it('não reabsorve quando folga == estrito (cadência espaçada)', () => {
    const r = reabsorbFromGrace([], [drop('d', '2026-06-16')], { cutoffISO: '2026-06-15', cutoffGraceISO: '2026-06-15', itemsMin: 5 });
    expect(r.reabsorbed).toHaveLength(0);
  });
});

describe('sortForDisplay', () => {
  const it2 = (titulo: string, data: string, rel: 'Alta' | 'Média' | 'Baixa'): BriefingItem => ({
    titulo, fonte: 'f', url: `https://ex.com/${titulo}`, data_publicacao: data, relevancia: rel, corpo: 'c',
  });
  it('põe preenchimento (Baixa) por último, mesmo se for mais recente', () => {
    const out = sortForDisplay([
      it2('fill-novo', '2026-06-19', 'Baixa'),
      it2('principal-velho', '2026-06-10', 'Alta'),
      it2('principal-novo', '2026-06-18', 'Média'),
    ]);
    expect(out.map((i) => i.titulo)).toEqual(['principal-novo', 'principal-velho', 'fill-novo']);
  });
  it('sem itens Baixa, é só recência', () => {
    const out = sortForDisplay([it2('a', '2026-06-10', 'Alta'), it2('b', '2026-06-18', 'Média')]);
    expect(out.map((i) => i.titulo)).toEqual(['b', 'a']);
  });
});

describe('normalizeTitleForDedup', () => {
  it('iguala títulos com acento/pontuação/caixa diferentes (base do dedup cross-edição)', () => {
    expect(normalizeTitleForDedup('Inteligência Artificial: o futuro!'))
      .toBe(normalizeTitleForDedup('inteligencia artificial o futuro'));
  });
  it('mantém títulos diferentes distintos', () => {
    expect(normalizeTitleForDedup('Flamengo vence'))
      .not.toBe(normalizeTitleForDedup('Vasco perde'));
  });
});

describe('sanitizeCorpo', () => {
  it('remove linha "Link: <url>" no fim do corpo', () => {
    const out = sanitizeCorpo('Texto do corpo aqui.\nLink: https://ex.com/artigo');
    expect(out).toBe('Texto do corpo aqui.');
  });

  it('remove URL solta e rótulo Fonte: http', () => {
    expect(sanitizeCorpo('Fato relevante.\n\nFonte: https://g1.globo.com/x')).toBe('Fato relevante.');
    expect(sanitizeCorpo('Veja em https://ex.com agora')).toBe('Veja em  agora');
  });

  it('não mexe em corpo sem URL', () => {
    const c = 'Um corpo denso, com números (R$ 3,5 mi) e sem links.';
    expect(sanitizeCorpo(c)).toBe(c);
  });

  it('lida com vazio', () => {
    expect(sanitizeCorpo('')).toBe('');
  });
});

describe('dedupeItems', () => {
  const it_ = (url: string, titulo: string) => ({ url, titulo });

  it('remove URL idêntica (o bug do artigo repetido), mantém a 1ª', () => {
    const out = dedupeItems([
      it_('https://a.com/x', 'A'),
      it_('https://b.com/y', 'B'),
      it_('https://a.com/x', 'A'),
    ]);
    expect(out.map((i) => i.titulo)).toEqual(['A', 'B']);
  });

  it('trata barra final e caixa como mesma URL', () => {
    const out = dedupeItems([
      it_('https://Ex.com/Post/', 'T1'),
      it_('https://ex.com/post', 'T2'),
    ]);
    expect(out).toHaveLength(1);
  });

  it('remove título quase-idêntico (mesma notícia, fontes diferentes)', () => {
    const out = dedupeItems([
      it_('https://folha.com/a', 'Reforma tributária: o que muda'),
      it_('https://g1.com/b', 'reforma  TRIBUTÁRIA, o que muda!'),
    ]);
    expect(out).toHaveLength(1);
  });

  it('mantém itens genuinamente distintos', () => {
    const out = dedupeItems([
      it_('https://a.com/1', 'Notícia um'),
      it_('https://a.com/2', 'Notícia dois'),
    ]);
    expect(out).toHaveLength(2);
  });
});
