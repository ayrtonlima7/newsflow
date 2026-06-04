'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProvider, extractJson } from '@/src/lib/providers';
import { normalizeTopics } from '@/src/lib/topic-normalization';
import type { Profile } from '@/src/lib/types';

export interface TopicSuggestionsContext {
  nome: string;
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string;
}

export async function generateTopicSuggestions(
  ctx: TopicSuggestionsContext,
): Promise<{ topics: string[]; error?: string }> {
  if (!ctx.tema || ctx.tema.length === 0) {
    return { topics: [], error: 'tema precisa estar preenchido' };
  }

  try {
    const provider = await getProvider();
    const system =
      'Você ajuda usuários a configurar uma curadoria de conteúdo personalizada. ' +
      'Você gera sugestões de tópicos, ferramentas, marcas e conceitos específicos relevantes ' +
      'para o perfil informado.';

    const contextLine = [
      `Tema(s) de interesse: ${ctx.tema.join(', ')}`,
      `Contexto: ${ctx.contexto || 'não informado'}`,
      ctx.descricao_livre ? `Sobre o usuário: ${ctx.descricao_livre}` : null,
      ctx.objetivo ? `Objetivo: ${ctx.objetivo}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const user = `${contextLine}

Gere de 8 a 12 tópicos/ferramentas/marcas/conceitos ESPECÍFICOS que essa pessoa poderia querer acompanhar.
Critérios:
- Específicos, não genéricos. Em vez de "tecnologia em geral", prefira "engenharia de plataformas em escala" ou "Kubernetes".
- Atuais (relevantes em 2026).
- Variados: misture técnico, mercado, tendências, ferramentas, pessoas/marcas notórias.
- Curtos (3-10 palavras).
- Coerentes com o contexto: se for "Hobby", evita termos hiper-corporativos; se for "Profissão", pode ir mais fundo.

Responda APENAS com um array JSON de strings, sem markdown:
["tópico 1", "tópico 2", ...]`;

    const result = await provider.complete({
      system,
      messages: [{ role: 'user', content: user }],
      webSearch: false,
      maxTokens: 8192,
    });

    if (!result.text.trim()) {
      console.error('[generateTopicSuggestions] texto vazio. usage:', result.usage);
      return {
        topics: [],
        error: 'modelo devolveu resposta vazia',
      };
    }

    const topics = extractJson<string[]>(result.text);
    if (!Array.isArray(topics)) {
      return { topics: [], error: 'resposta inválida do modelo' };
    }
    return {
      topics: topics.filter((t) => typeof t === 'string' && t.trim().length > 0),
    };
  } catch (err) {
    console.error('[generateTopicSuggestions] erro:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { topics: [], error: `falha ao gerar sugestões: ${msg}` };
  }
}

export async function saveProfile(profile: Profile): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'não autenticado' };

  if (!profile.nome?.trim()) {
    return { ok: false, error: 'nome é obrigatório' };
  }
  if (!Array.isArray(profile.tema) || profile.tema.length === 0) {
    return { ok: false, error: 'escolha pelo menos um tema' };
  }
  if (!profile.contexto?.trim()) {
    return { ok: false, error: 'escolha um contexto' };
  }
  if (!profile.objetivo?.trim()) {
    return { ok: false, error: 'escolha um objetivo' };
  }
  if (!Array.isArray(profile.topicos) || profile.topicos.length === 0) {
    return { ok: false, error: 'adicione pelo menos um tópico' };
  }
  if (!Array.isArray(profile.formatos) || profile.formatos.length === 0) {
    return { ok: false, error: 'escolha pelo menos um formato' };
  }

  const topicos_busca = await normalizeTopics(profile.topicos, {
    tema: profile.tema,
    contexto: profile.contexto,
    descricao_livre: profile.descricao_livre,
    objetivo: profile.objetivo,
  });

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: user.id,
      nome: profile.nome.trim(),
      tema: profile.tema,
      contexto: profile.contexto,
      descricao_livre: profile.descricao_livre ?? '',
      objetivo: profile.objetivo,
      topicos: profile.topicos,
      topicos_busca,
      referencias: profile.referencias ?? [],
      formatos: profile.formatos,
      ignorar: profile.ignorar ?? [],
      frequencia: profile.frequencia,
      horario: profile.horario || '8h',
      is_active: true,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[saveProfile] erro:', error);
    return { ok: false, error: error.message };
  }

  redirect('/settings?welcome=1');
}
