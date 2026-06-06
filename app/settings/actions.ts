'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeTopics } from '@/src/lib/topic-normalization';
import { runDeliveryPipeline } from '@/src/lib/delivery';
import type { Profile } from '@/src/lib/types';
import { SAMPLE_COOLDOWN_MS } from './constants';

export interface ProfileUpdateInput {
  nome: string;
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string;
  topicos: string[];
  referencias: string[];
  formatos: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
}

export async function updateProfile(
  input: ProfileUpdateInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'não autenticado' };

  if (!input.nome?.trim()) {
    return { ok: false, error: 'nome é obrigatório' };
  }
  if (!Array.isArray(input.tema) || input.tema.length === 0) {
    return { ok: false, error: 'escolha pelo menos um tema' };
  }
  if (!input.contexto?.trim()) {
    return { ok: false, error: 'escolha um contexto' };
  }
  if (!input.objetivo?.trim()) {
    return { ok: false, error: 'escolha um objetivo' };
  }
  if (!Array.isArray(input.topicos) || input.topicos.length === 0) {
    return { ok: false, error: 'adicione pelo menos um tópico' };
  }
  if (!Array.isArray(input.formatos) || input.formatos.length === 0) {
    return { ok: false, error: 'escolha pelo menos um formato' };
  }
  if (!input.frequencia?.trim()) {
    return { ok: false, error: 'escolha uma frequência' };
  }
  if (!input.horario?.trim()) {
    return { ok: false, error: 'escolha um horário' };
  }

  const topicos_busca = await normalizeTopics(input.topicos, {
    tema: input.tema,
    contexto: input.contexto,
    descricao_livre: input.descricao_livre,
    objetivo: input.objetivo,
  });

  const { error } = await supabase
    .from('profiles')
    .update({
      nome: input.nome.trim(),
      tema: input.tema,
      contexto: input.contexto,
      descricao_livre: input.descricao_livre ?? '',
      objetivo: input.objetivo,
      topicos: input.topicos,
      topicos_busca,
      referencias: input.referencias ?? [],
      formatos: input.formatos,
      ignorar: input.ignorar ?? [],
      frequencia: input.frequencia,
      horario: input.horario.trim(),
    })
    .eq('user_id', user.id);

  if (error) {
    console.error('[updateProfile] erro:', error);
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings');
  return { ok: true };
}

export interface SampleResult {
  ok: boolean;
  error?: string;
  itemsCount?: number;
  costBrl?: number;
  elapsedSeconds?: number;
  status?: string;
  cooldownRemainingMs?: number;
  /** Para preview inline em dev. */
  deliveryId?: string;
}

export async function sendSampleNow(): Promise<SampleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: 'não autenticado' };

  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!profileRow) return { ok: false, error: 'perfil não encontrado' };

  if (profileRow.last_delivered_at) {
    const last = new Date(profileRow.last_delivered_at).getTime();
    const elapsed = Date.now() - last;
    if (elapsed < SAMPLE_COOLDOWN_MS) {
      const remainingMs = SAMPLE_COOLDOWN_MS - elapsed;
      const remainingMin = Math.ceil(remainingMs / 60_000);
      return {
        ok: false,
        error: `Aguarde ${remainingMin} minuto${remainingMin > 1 ? 's' : ''} antes de gerar outro email`,
        cooldownRemainingMs: remainingMs,
      };
    }
  }

  const profile: Profile = {
    nome: profileRow.nome ?? '',
    tema: profileRow.tema ?? [],
    contexto: profileRow.contexto ?? '',
    descricao_livre: profileRow.descricao_livre ?? '',
    objetivo: profileRow.objetivo ?? '',
    topicos: profileRow.topicos ?? [],
    topicos_busca: profileRow.topicos_busca ?? undefined,
    referencias: profileRow.referencias ?? [],
    formatos: profileRow.formatos ?? [],
    ignorar: profileRow.ignorar ?? [],
    frequencia: profileRow.frequencia ?? '',
    horario: profileRow.horario ?? '8h',
  };

  const result = await runDeliveryPipeline(
    { userId: user.id, email: user.email, profile },
    { dryRun: false },
  );

  if (result.status === 'failed') {
    return {
      ok: false,
      error: result.error ?? 'erro desconhecido',
      status: result.status,
      costBrl: result.costBrl,
      elapsedSeconds: result.elapsedSeconds,
    };
  }
  if (result.status === 'skipped_empty') {
    return {
      ok: false,
      error:
        'a curadoria não retornou conteúdo verificável agora — tente de novo em alguns minutos',
      status: result.status,
      costBrl: result.costBrl,
      elapsedSeconds: result.elapsedSeconds,
    };
  }
  // Defensivo: o botão só aparece pra quem está liberado, mas o gate é
  // reavaliado no envio (status pode ter mudado). Não conta como "enviado".
  if (result.status === 'skipped_gate') {
    return {
      ok: false,
      error: 'comece seu mês grátis pra receber a curadoria.',
      status: result.status,
    };
  }
  return {
    ok: true,
    itemsCount: result.itemsCount,
    status: result.status,
    costBrl: result.costBrl,
    elapsedSeconds: result.elapsedSeconds,
    deliveryId: result.deliveryId ?? undefined,
  };
}

export async function setActive(
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'não autenticado' };

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: active })
    .eq('user_id', user.id);

  if (error) {
    console.error('[setActive] erro:', error);
    return { ok: false, error: error.message };
  }

  revalidatePath('/settings');
  return { ok: true };
}
