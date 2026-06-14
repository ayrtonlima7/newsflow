import { describe, it, expect } from 'vitest';
import { filterByFreshness, dedupeItems } from './pipeline';
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
