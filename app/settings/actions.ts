'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeTopics } from '@/src/lib/topic-normalization';
import { runDeliveryPipeline } from '@/src/lib/delivery';
import type { Profile } from '@/src/lib/types';

export interface ProfileUpdateInput {
  area: string;
  cargo: string;
  topicos: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
  tom: string;
  fontes_prioritarias: string[];
}

export async function updateProfile(
  input: ProfileUpdateInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'não autenticado' };

  if (!input.area?.trim() || !input.cargo?.trim()) {
    return { ok: false, error: 'área e cargo são obrigatórios' };
  }
  if (!Array.isArray(input.topicos) || input.topicos.length === 0) {
    return { ok: false, error: 'pelo menos um tópico é obrigatório' };
  }
  if (!input.frequencia?.trim() || !input.horario?.trim() || !input.tom?.trim()) {
    return { ok: false, error: 'frequência, horário e tom são obrigatórios' };
  }

  const topicos_busca = await normalizeTopics(input.topicos, {
    area: input.area.trim(),
    cargo: input.cargo.trim(),
  });

  const { error } = await supabase
    .from('profiles')
    .update({
      area: input.area.trim(),
      cargo: input.cargo.trim(),
      topicos: input.topicos,
      topicos_busca,
      ignorar: input.ignorar ?? [],
      frequencia: input.frequencia.trim(),
      horario: input.horario.trim(),
      tom: input.tom.trim(),
      fontes_prioritarias: input.fontes_prioritarias ?? [],
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
}

// Cooldown entre cliques no "Enviar agora" pra evitar spam de geração e
// gastos de API descontrolados. Vale por usuário.
export const SAMPLE_COOLDOWN_MS = 5 * 60 * 1000;

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

  // Checagem de cooldown — não confiar só no frontend, validar aqui também
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
    area: profileRow.area,
    cargo: profileRow.cargo,
    topicos: profileRow.topicos,
    topicos_busca: profileRow.topicos_busca ?? undefined,
    ignorar: profileRow.ignorar,
    frequencia: profileRow.frequencia,
    horario: profileRow.horario,
    tom: profileRow.tom,
    fontes_prioritarias: profileRow.fontes_prioritarias,
    descricoes_livres: profileRow.descricoes_livres ?? {},
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
  return {
    ok: true,
    itemsCount: result.itemsCount,
    status: result.status,
    costBrl: result.costBrl,
    elapsedSeconds: result.elapsedSeconds,
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
