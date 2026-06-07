'use server';

import { randomInt } from 'node:crypto';
import { Resend } from 'resend';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeTopics } from '@/src/lib/topic-normalization';
import { deriveDomains } from '@/src/lib/domain-derivation';
import { runDeliveryPipeline } from '@/src/lib/delivery';
import type { Profile } from '@/src/lib/types';
import { SAMPLE_COOLDOWN_MS } from './constants';

const DELIVERY_CODE_TTL_MIN = 15;
const DELIVERY_CODE_MAX_ATTEMPTS = 5;

export interface ProfileUpdateInput {
  nome: string;
  tema: string[];
  contexto: string[];
  descricao_livre: string;
  objetivo: string[];
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
  if (!Array.isArray(input.contexto) || input.contexto.length === 0) {
    return { ok: false, error: 'escolha um contexto' };
  }
  if (!Array.isArray(input.objetivo) || input.objetivo.length === 0) {
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

  const [topicos_busca, dominios_busca] = await Promise.all([
    normalizeTopics(input.topicos, {
      tema: input.tema,
      contexto: input.contexto.join(', '),
      descricao_livre: input.descricao_livre,
      objetivo: input.objetivo.join(', '),
    }),
    deriveDomains({
      nome: input.nome,
      tema: input.tema,
      contexto: input.contexto,
      descricao_livre: input.descricao_livre,
      objetivo: input.objetivo,
      topicos: input.topicos,
      referencias: input.referencias,
      formatos: input.formatos,
      ignorar: input.ignorar,
      frequencia: input.frequencia,
      horario: input.horario,
    }),
  ]);

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
      dominios_busca,
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
    contexto: profileRow.contexto ?? [],
    descricao_livre: profileRow.descricao_livre ?? '',
    objetivo: profileRow.objetivo ?? [],
    topicos: profileRow.topicos ?? [],
    topicos_busca: profileRow.topicos_busca ?? undefined,
    dominios_busca: profileRow.dominios_busca ?? undefined,
    referencias: profileRow.referencias ?? [],
    formatos: profileRow.formatos ?? [],
    ignorar: profileRow.ignorar ?? [],
    frequencia: profileRow.frequencia ?? '',
    horario: profileRow.horario ?? '8h',
    delivery_email: profileRow.delivery_email ?? undefined,
    idioma: profileRow.idioma ?? 'pt',
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DeliveryEmailRequest =
  | { status: 'cleared' }
  | { status: 'code_sent'; email: string }
  | { status: 'error'; error: string };

/**
 * Passo 1 da troca do email de entrega: valida e dispara um código de 6 dígitos
 * pro novo endereço. Vazio ou igual ao email da conta → limpa a preferência (sem
 * verificação, pois o email da conta já é confiável).
 *
 * O código vai numa tabela com RLS fechada (admin client) — o usuário não
 * consegue lê-lo pelo banco, só recebendo no inbox.
 */
export async function requestDeliveryEmailChange(
  rawEmail: string,
): Promise<DeliveryEmailRequest> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: 'error', error: 'não autenticado' };

  const admin = createAdminClient();
  const email = rawEmail.trim().toLowerCase();

  // Vazio ou == email da conta → limpa preferência e qualquer verificação pendente.
  if (!email || email === user.email.toLowerCase()) {
    await admin.from('email_verifications').delete().eq('user_id', user.id);
    const { error } = await admin
      .from('profiles')
      .update({ delivery_email: null })
      .eq('user_id', user.id);
    if (error) return { status: 'error', error: error.message };
    revalidatePath('/settings');
    return { status: 'cleared' };
  }

  if (!EMAIL_RE.test(email)) {
    return { status: 'error', error: 'digite um email válido' };
  }

  // Cooldown anti-spam: impede usar o disparo de código como relay pra bombardear
  // endereços arbitrários (protege a reputação de envio do domínio). last_sent é
  // derivado do expires_at do código anterior (expires_at − TTL).
  const { data: existing } = await admin
    .from('email_verifications')
    .select('expires_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) {
    const lastSent = new Date(existing.expires_at).getTime() - DELIVERY_CODE_TTL_MIN * 60_000;
    if (Date.now() - lastSent < 60_000) {
      return { status: 'error', error: 'aguarde um minuto antes de pedir outro código.' };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + DELIVERY_CODE_TTL_MIN * 60_000).toISOString();

  const { error: upErr } = await admin.from('email_verifications').upsert(
    {
      user_id: user.id,
      pending_email: email,
      code,
      expires_at: expiresAt,
      attempts: 0,
    },
    { onConflict: 'user_id' },
  );
  if (upErr) return { status: 'error', error: upErr.message };

  // Envia o código pro endereço a ser verificado.
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!resendKey || !from) {
    return { status: 'error', error: 'envio de email não configurado' };
  }
  const resend = new Resend(resendKey);
  const { error: sendErr } = await resend.emails.send({
    from,
    to: email,
    subject: `Seu código de verificação NewsFlow: ${code}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
        <h2 style="font-size:18px;margin:0 0 12px">Confirme seu email de entrega</h2>
        <p style="font-size:14px;line-height:1.5;color:#44403c">
          Use o código abaixo pra confirmar que quer receber a curadoria do NewsFlow neste endereço:
        </p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p style="font-size:12px;color:#78716c">
          O código expira em ${DELIVERY_CODE_TTL_MIN} minutos. Se você não pediu isso, ignore este email.
        </p>
      </div>`,
  });
  if (sendErr) {
    console.error('[requestDeliveryEmailChange] resend:', sendErr);
    return { status: 'error', error: 'não foi possível enviar o código — confira o email digitado' };
  }

  return { status: 'code_sent', email };
}

/**
 * Passo 2: confirma o código. Acerto → grava delivery_email e apaga a verificação.
 * Erro → conta tentativa; passa do limite ou expira → invalida e pede pra recomeçar.
 */
export async function confirmDeliveryEmail(
  rawCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'não autenticado' };

  const admin = createAdminClient();
  const code = rawCode.trim();

  const { data: row } = await admin
    .from('email_verifications')
    .select('pending_email, code, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!row) return { ok: false, error: 'nenhuma verificação pendente — peça um novo código.' };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('email_verifications').delete().eq('user_id', user.id);
    return { ok: false, error: 'código expirado — peça um novo.' };
  }

  if (row.attempts >= DELIVERY_CODE_MAX_ATTEMPTS) {
    await admin.from('email_verifications').delete().eq('user_id', user.id);
    return { ok: false, error: 'muitas tentativas — peça um novo código.' };
  }

  if (code !== row.code) {
    await admin
      .from('email_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('user_id', user.id);
    return { ok: false, error: 'código incorreto.' };
  }

  // Acerto → grava o email de entrega e limpa a verificação.
  const { error: upErr } = await admin
    .from('profiles')
    .update({ delivery_email: row.pending_email })
    .eq('user_id', user.id);
  if (upErr) return { ok: false, error: upErr.message };

  await admin.from('email_verifications').delete().eq('user_id', user.id);

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
