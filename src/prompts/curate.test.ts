import { describe, it, expect } from 'vitest';
import { buildSearchQueries, withNewsIntent } from './curate';
import type { Profile } from '../lib/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    nome: 'Teste',
    tema: [],
    contexto: [],
    descricao_livre: '',
    objetivo: [],
    topicos: [],
    referencias: [],
    formatos: [],
    ignorar: [],
    frequencia: 'daily',
    horario: '8h',
    ...overrides,
  };
}

describe('withNewsIntent', () => {
  it('anexa a palavra de notícia por idioma', () => {
    expect(withNewsIntent('Botafogo', 'pt')).toBe('Botafogo notícias');
    expect(withNewsIntent('Botafogo', 'en')).toBe('Botafogo news');
    expect(withNewsIntent('Botafogo', 'es')).toBe('Botafogo noticias');
  });

  it('é idempotente — não duplica a palavra se já presente', () => {
    expect(withNewsIntent('Botafogo notícias', 'pt')).toBe('Botafogo notícias');
    expect(withNewsIntent('últimas notícias do Flamengo', 'pt')).toBe(
      'últimas notícias do Flamengo',
    );
  });

  it('detecta a palavra sem diferenciar maiúsculas', () => {
    expect(withNewsIntent('AI News today', 'en')).toBe('AI News today');
  });

  it('só evita duplicação quando é palavra inteira (boundary)', () => {
    // "noticiário" contém "noticia" como substring, mas não como palavra → anexa.
    expect(withNewsIntent('noticiário esportivo', 'es')).toBe(
      'noticiário esportivo noticias',
    );
  });
});

describe('buildSearchQueries', () => {
  it('gera uma query por tópico com intenção de notícia', () => {
    const p = makeProfile({ topicos: ['Botafogo', 'mercado da bola'] });
    expect(buildSearchQueries(p, 'pt')).toEqual([
      'Botafogo notícias',
      'mercado da bola notícias',
    ]);
  });

  it('usa topicos_busca (normalizados) quando presentes', () => {
    const p = makeProfile({
      topicos: ['bota fogo'],
      topicos_busca: ['Botafogo Brasileirão'],
    });
    expect(buildSearchQueries(p, 'pt')).toEqual(['Botafogo Brasileirão notícias']);
  });

  it('sem tópicos, amplia com uma query por tema (própria área do usuário)', () => {
    const p = makeProfile({ tema: ['tecnologia', 'startups'] });
    expect(buildSearchQueries(p, 'pt')).toEqual(['tecnologia notícias', 'startups notícias']);
  });

  it('perfil estreito (poucos tópicos) amplia com o tema amplo', () => {
    const p = makeProfile({ topicos_busca: ['React Native'], tema: ['Tecnologia'] });
    expect(buildSearchQueries(p, 'pt')).toEqual(['React Native notícias', 'Tecnologia notícias']);
  });

  it('respeita o idioma na palavra de notícia', () => {
    const p = makeProfile({ topicos: ['climate change'] });
    expect(buildSearchQueries(p, 'en')).toEqual(['climate change news']);
  });

  it('limita a 6 queries (free tier da Tavily)', () => {
    const p = makeProfile({ topicos: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    expect(buildSearchQueries(p, 'pt')).toHaveLength(6);
  });

  it('ignora tópicos vazios/whitespace', () => {
    const p = makeProfile({ topicos: ['Botafogo', '   ', ''] });
    expect(buildSearchQueries(p, 'pt')).toEqual(['Botafogo notícias']);
  });
});
