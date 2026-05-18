'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProvider, extractJson } from '@/src/lib/providers';
import type { Profile } from '@/src/lib/types';

export async function generateTopicSuggestions(
  area: string,
  cargo: string,
): Promise<{ topics: string[]; error?: string }> {
  if (!area.trim() || !cargo.trim()) {
    return { topics: [], error: 'área e cargo precisam estar preenchidos' };
  }

  try {
    const provider = await getProvider();
    const system =
      'Você ajuda usuários a configurar uma curadoria de conteúdo personalizada. ' +
      'Você gera sugestões de tópicos específicos e relevantes para uma pessoa, ' +
      'com base na área e cargo dela.';

    const user = `O usuário trabalha na área de "${area}" como "${cargo}".

Gere de 8 a 12 tópicos específicos que ele poderia querer acompanhar — tópicos que façam sentido
para alguém nessa área e cargo. Os tópicos devem ser:
- Específicos (não "tecnologia em geral", mas "engenharia de plataformas em escala")
- Atuais (relevantes em 2026)
- Variados (mistura de técnico, mercado, tendências, ferramentas)
- Curtos (5-10 palavras cada)

Responda APENAS com um array JSON de strings, sem markdown:
["tópico 1", "tópico 2", ...]`;

    const result = await provider.complete({
      system,
      messages: [{ role: 'user', content: user }],
      webSearch: false,
      maxTokens: 8192,
    });

    if (!result.text.trim()) {
      console.error('[generateTopicSuggestions] texto vazio do modelo. usage:', result.usage);
      return { topics: [], error: 'modelo devolveu resposta vazia (tokens esgotados em raciocínio)' };
    }

    const topics = extractJson<string[]>(result.text);
    if (!Array.isArray(topics)) {
      return { topics: [], error: 'resposta inválida do modelo' };
    }
    return { topics: topics.filter((t) => typeof t === 'string' && t.trim().length > 0) };
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

  if (!profile.area?.trim() || !profile.cargo?.trim() || profile.topicos.length === 0) {
    return { ok: false, error: 'área, cargo e ao menos um tópico são obrigatórios' };
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: user.id,
      area: profile.area,
      cargo: profile.cargo,
      topicos: profile.topicos,
      ignorar: profile.ignorar,
      frequencia: profile.frequencia,
      horario: profile.horario,
      tom: profile.tom,
      fontes_prioritarias: profile.fontes_prioritarias,
      descricoes_livres: profile.descricoes_livres,
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
