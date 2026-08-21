'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider, extractJson } from '@/src/lib/providers';
import { normalizeTopics } from '@/src/lib/topic-normalization';
import { deriveDomains } from '@/src/lib/domain-derivation';
import {
  decideQuota,
  spToday,
  SUGGESTIONS_DAILY_LIMIT,
} from '@/src/lib/suggestion-quota';
import { isFreeMode } from '@/src/lib/subscription';
import type { Profile } from '@/src/lib/types';

export interface TopicSuggestionsContext {
  nome: string;
  tema: string[];
  contexto: string[];
  descricao_livre: string;
  objetivo: string[];
  referencias: string[];
  formatos: string[];
  ignorar: string[];
}

export async function generateTopicSuggestions(
  ctx: TopicSuggestionsContext,
): Promise<{ topics: string[]; error?: string }> {
  if (!ctx.tema || ctx.tema.length === 0) {
    return { topics: [], error: 'tema precisa estar preenchido' };
  }

  try {
    // Provider explícito (mesmo padrão de curate/normalize) — NÃO usar getProvider()
    // sem arg, que cai no default 'gemini' (dormente) se LLM_PROVIDER faltar.
    const provider = await getProvider(
      process.env.NORMALIZE_LLM_PROVIDER ??
        process.env.EMAIL_LLM_PROVIDER ??
        process.env.LLM_PROVIDER,
    );
    const system =
      'Você ajuda usuários a configurar uma curadoria de conteúdo personalizada. ' +
      'Você gera sugestões de tópicos, ferramentas, marcas e conceitos específicos relevantes ' +
      'para o perfil informado. Use TODAS as informações disponíveis pra gerar sugestões cirúrgicas — ' +
      'especialmente as referências (pessoas/marcas/canais que o usuário admira), que apontam pra ' +
      'subáreas muito específicas.';

    const contextLine = [
      `Tema(s) de interesse: ${ctx.tema.join(', ')}`,
      `Contexto: ${ctx.contexto.length ? ctx.contexto.join(', ') : 'não informado'}`,
      ctx.descricao_livre ? `Sobre o usuário: ${ctx.descricao_livre}` : null,
      ctx.objetivo.length ? `Objetivo: ${ctx.objetivo.join(', ')}` : null,
      ctx.referencias.length > 0
        ? `Referências que o usuário admira/segue: ${ctx.referencias.join(', ')}`
        : null,
      ctx.formatos.length > 0
        ? `Formatos preferidos de consumo: ${ctx.formatos.join(', ')}`
        : null,
      ctx.ignorar.length > 0 ? `Quer EVITAR: ${ctx.ignorar.join(', ')}` : null,
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
- Use as REFERÊNCIAS como sinal forte: se o usuário admira "Lex Fridman", inclua tópicos como "AI alignment", "entrevistas longas com pesquisadores"; se admira "Anthropic", inclua "Claude", "constitutional AI", "interpretabilidade". As referências apontam pras subáreas mais valiosas pro usuário.
- Use os FORMATOS preferidos como sinal: se prefere "Vídeos/podcasts", priorize tópicos com ecossistema de áudio forte; se prefere "Estudos/papers", inclua áreas com produção acadêmica robusta.
- EVITE qualquer sugestão que caia dentro do que o usuário disse pra evitar (Ignorar). Se ele disse "tutoriais básicos", não sugira "Aprender Python do zero".

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

export interface RegenerateResult {
  topics: string[];
  error?: string;
  /** Regenerações restantes hoje (undefined quando não deu pra apurar). */
  remaining?: number;
  /** true quando a cota do dia acabou — a UI mostra a mensagem de limite. */
  limitReached?: boolean;
}

/**
 * Gera sugestões de tópicos SOB DEMANDA (botão "gerar outras"), consumindo a
 * cota diária. Usada tanto no onboarding quanto em /settings.
 *
 * A geração AUTOMÁTICA do wizard (ao chegar na pergunta de tópicos) NÃO passa
 * por aqui e não consome cota — ela é parte do fluxo. Só o pedido explícito
 * conta.
 */
export async function regenerateTopicSuggestions(
  ctx: TopicSuggestionsContext,
): Promise<RegenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { topics: [], error: 'não autenticado' };

  // Cota via ADMIN client: a tabela tem RLS sem policies (o usuário não pode
  // ler nem zerar a própria cota).
  const admin = createAdminClient();
  const today = spToday();
  let decision = { allowed: true, nextCount: 1, remaining: SUGGESTIONS_DAILY_LIMIT - 1 };
  let quotaTracked = false;

  try {
    const { data: row, error: readErr } = await admin
      .from('suggestion_quota')
      .select('used_date, used_count')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    decision = decideQuota(row ?? null, today);
    quotaTracked = true;

    if (!decision.allowed) {
      return {
        topics: [],
        limitReached: true,
        remaining: 0,
        error: `Limite de ${SUGGESTIONS_DAILY_LIMIT} regenerações por dia atingido.`,
      };
    }
  } catch (e) {
    // Migration 0015 ainda não aplicada (ou banco indisponível) → FALHA ABERTA:
    // a feature continua funcionando sem contar cota, em vez de morrer silenciosa.
    console.warn(
      '[regenerateTopicSuggestions] cota não apurada (migration 0015 aplicada?):',
      e instanceof Error ? e.message : e,
    );
  }

  const result = await generateTopicSuggestions(ctx);

  // Só consome a cota se a geração deu certo — erro de LLM não deve queimar
  // tentativa do usuário.
  if (quotaTracked && result.topics.length > 0) {
    const { error: upErr } = await admin.from('suggestion_quota').upsert(
      {
        user_id: user.id,
        used_date: today,
        used_count: decision.nextCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (upErr) console.warn('[regenerateTopicSuggestions] cota não gravada:', upErr.message);
  }

  return {
    ...result,
    remaining: quotaTracked && result.topics.length > 0 ? decision.remaining : undefined,
  };
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
  if (!Array.isArray(profile.contexto) || profile.contexto.length === 0) {
    return { ok: false, error: 'escolha um contexto' };
  }
  if (!Array.isArray(profile.objetivo) || profile.objetivo.length === 0) {
    return { ok: false, error: 'escolha um objetivo' };
  }
  if (!Array.isArray(profile.topicos) || profile.topicos.length === 0) {
    return { ok: false, error: 'adicione pelo menos um tópico' };
  }
  if (!Array.isArray(profile.formatos) || profile.formatos.length === 0) {
    return { ok: false, error: 'escolha pelo menos um formato' };
  }

  // --- Passo 1: SALVA o perfil PRIMEIRO, sem os campos derivados. ---
  // Antes as 2 chamadas de LLM (normalizeTopics + deriveDomains) rodavam ANTES do
  // upsert: se estourassem o timeout da função, ela morria antes de gravar e o
  // usuário ficava preso no onboarding ("o perfil não é gerado"). Agora o save é
  // incondicionalmente durável — o perfil funciona sem os derivados:
  // `topicos_busca` vazio → o pipeline usa `topicos` cru (profileForPrompt);
  // `dominios_busca` null → resolveDomains() cai na lista estática.
  // Modo grátis ligado → o perfil nasce com acesso VITALÍCIO. É a promessa do
  // requisito: quem entrou na era grátis continua recebendo mesmo se a flag
  // voltar pra OFF. (Assinante pagante não passa por aqui — ele já tem perfil.)
  const freeMode = isFreeMode();

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: user.id,
      nome: profile.nome.trim(),
      tema: profile.tema,
      contexto: profile.contexto,
      descricao_livre: profile.descricao_livre ?? '',
      objetivo: profile.objetivo,
      topicos: profile.topicos,
      referencias: profile.referencias ?? [],
      formatos: profile.formatos,
      ignorar: profile.ignorar ?? [],
      frequencia: profile.frequencia,
      horario: profile.horario || '8h',
      is_active: true,
      ...(freeMode ? { free_forever: true } : {}),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[saveProfile] erro:', error);
    return { ok: false, error: error.message };
  }

  // --- Passo 2: deriva os campos de busca e atualiza (best-effort). ---
  // Falha/timeout aqui NÃO impede o usuário de seguir: o perfil já está salvo e
  // funcional. `npm run rederive-domains` faz o backfill dos que ficaram vazios.
  try {
    const [topicos_busca, dominios_busca] = await Promise.all([
      normalizeTopics(profile.topicos, {
        tema: profile.tema,
        contexto: profile.contexto.join(', '),
        descricao_livre: profile.descricao_livre,
        objetivo: profile.objetivo.join(', '),
      }),
      deriveDomains(profile),
    ]);
    const { error: derivErr } = await supabase
      .from('profiles')
      .update({ topicos_busca, dominios_busca })
      .eq('user_id', user.id);
    if (derivErr) {
      console.warn('[saveProfile] derivados não gravados:', derivErr.message);
    }
  } catch (e) {
    console.warn('[saveProfile] derivação falhou (perfil já salvo, segue):', e);
  }

  redirect('/settings?welcome=1');
}
