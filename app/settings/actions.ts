'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

  const { error } = await supabase
    .from('profiles')
    .update({
      area: input.area.trim(),
      cargo: input.cargo.trim(),
      topicos: input.topicos,
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
