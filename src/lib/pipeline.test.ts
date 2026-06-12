import { describe, it, expect } from 'vitest';
import { filterByFreshness } from './pipeline';
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
