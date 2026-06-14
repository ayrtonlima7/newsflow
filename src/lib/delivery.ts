import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBriefing, generateEmail } from './pipeline';
import { canDeliver, type SubscriptionStatus } from './subscription';
import { frequenciaParaJanela, type Profile } from './types';

export interface DeliveryInput {
  userId: string;
  email: string;
  profile: Profile;
}

export interface DeliveryOptions {
  dryRun?: boolean;
  overrideTo?: string;
  /** Pula o gating de assinatura (ex: admin forçando). Default false. */
  skipGate?: boolean;
}

export type DeliveryStatus =
  | 'sent'
  | 'failed'
  | 'skipped_empty'
  | 'skipped_gate'
  | 'dry_run';

export interface DeliveryResult {
  deliveryId: string | null;
  briefingId: string | null;
  status: DeliveryStatus;
  resendId?: string;
  itemsCount?: number;
  costBrl: number;
  elapsedSeconds: number;
  error?: string;
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

/** Lê o status de assinatura e aplica o gating (Stripe é a fonte da verdade). */
async function checkGate(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ allowed: boolean; reason: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('user_id', userId)
    .maybeSingle();

  const status = (profile?.subscription_status ?? 'free') as SubscriptionStatus;

  const gate = canDeliver(status);
  if (!gate.allowed) {
    console.log(`[delivery] bloqueado pelo gate: ${gate.reason} (user ${userId})`);
  }
  return { allowed: gate.allowed, reason: gate.reason };
}

export async function runDeliveryPipeline(
  input: DeliveryInput,
  opts: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const supabase = createAdminClient();
  const t0 = Date.now();
  let deliveryId: string | null = null;
  let briefingId: string | null = null;
  let costBrl = 0;

  try {
    // --- Gating de assinatura/trial — ANTES de gastar tokens de IA ---
    if (!opts.skipGate) {
      const gate = await checkGate(supabase, input.userId);
      if (!gate.allowed) {
        return {
          deliveryId: null,
          briefingId: null,
          status: 'skipped_gate',
          costBrl: 0,
          elapsedSeconds: (Date.now() - t0) / 1000,
          error: gate.reason,
        };
      }
    }

    // --- Dedup entre entregas: junta as URLs que o usuário já recebeu nas edições
    //     dentro da janela de frescor (URLs mais antigas que isso não reapareceriam
    //     de qualquer forma, o frescor as cortaria). Falha-segura: erro aqui só
    //     desliga o dedup, não derruba a entrega. ---
    const janela = frequenciaParaJanela(input.profile.frequencia);
    const sinceISO = new Date(Date.now() - janela.janelaDias * 86_400_000).toISOString();
    const excludeUrls = new Set<string>();
    try {
      const { data: recentes } = await supabase
        .from('briefings')
        .select('itens')
        .eq('user_id', input.userId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(10);
      for (const b of recentes ?? []) {
        for (const it of (b.itens ?? []) as Array<{ url?: string }>) {
          if (it?.url) excludeUrls.add(it.url);
        }
      }
      if (excludeUrls.size > 0) {
        console.log(`[delivery] dedup: ${excludeUrls.size} URL(s) recentes a evitar (user ${input.userId})`);
      }
    } catch (e) {
      console.warn('[delivery] dedup: falha ao buscar URLs recentes, seguindo sem dedup:', e);
    }

    const { briefing, meta: curateMeta } = await generateBriefing(input.profile, { excludeUrls });
    costBrl += curateMeta.cost.totalBRL;

    const { data: briefingRow, error: bErr } = await supabase
      .from('briefings')
      .insert({
        user_id: input.userId,
        data_referencia: briefing.data_referencia,
        itens: briefing.itens,
        meta: { ...curateMeta, generated_at: new Date().toISOString() },
      })
      .select('id')
      .single();
    if (bErr) throw new Error(`gravar briefing: ${bErr.message}`);
    briefingId = briefingRow.id;

    if (briefing.itens.length === 0) {
      return {
        deliveryId: null,
        briefingId,
        status: 'skipped_empty',
        itemsCount: 0,
        costBrl,
        elapsedSeconds: (Date.now() - t0) / 1000,
      };
    }

    const { email, meta: emailMeta } = await generateEmail(input.profile, briefing);
    costBrl += emailMeta.cost.totalBRL;

    const { data: deliveryRow, error: dErr } = await supabase
      .from('deliveries')
      .insert({
        user_id: input.userId,
        briefing_id: briefingId,
        subject: email.assunto,
        html: '',
        status: 'pending',
      })
      .select('id')
      .single();
    if (dErr) throw new Error(`criar delivery: ${dErr.message}`);
    deliveryId = deliveryRow.id;

    const base = appUrl();
    const html = email.html
      .replaceAll('{{FEEDBACK_URL_YES}}', `${base}/api/feedback?id=${deliveryId}&v=up`)
      .replaceAll('{{FEEDBACK_URL_NO}}', `${base}/api/feedback?id=${deliveryId}&v=down`);

    if (opts.dryRun) {
      await supabase
        .from('deliveries')
        .update({ html, status: 'skipped', error_message: 'dry run' })
        .eq('id', deliveryId);
      return {
        deliveryId,
        briefingId,
        status: 'dry_run',
        itemsCount: briefing.itens.length,
        costBrl,
        elapsedSeconds: (Date.now() - t0) / 1000,
      };
    }

    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    if (!resendKey) throw new Error('RESEND_API_KEY ausente');
    if (!from) throw new Error('RESEND_FROM ausente');

    // Destino: override explícito > override de env > email de entrega do perfil
    // > email da conta (auth). delivery_email permite receber em outro endereço.
    const deliveryEmail = input.profile.delivery_email?.trim() || undefined;
    const to =
      opts.overrideTo ?? process.env.RESEND_OVERRIDE_TO ?? deliveryEmail ?? input.email;
    const unsubscribeUrl = `${base}/api/unsubscribe?id=${deliveryId}`;
    const resend = new Resend(resendKey);
    const { data: sendData, error: sendErr } = await resend.emails.send({
      from,
      to,
      subject: email.assunto,
      html,
      headers: {
        // RFC 2369 / RFC 8058: ajudam Gmail/Outlook a categorizar como lista
        // legítima (em vez de "Promoções") e habilitam o botão nativo de
        // cancelar no cliente de email.
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (sendErr) throw new Error(`Resend: ${JSON.stringify(sendErr)}`);

    await supabase
      .from('deliveries')
      .update({
        html,
        resend_id: sendData?.id ?? null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    // last_delivered_at é load-bearing (idempotência do cron) — atualiza sempre,
    // isolado de qualquer coluna nova.
    await supabase
      .from('profiles')
      .update({ last_delivered_at: new Date().toISOString() })
      .eq('user_id', input.userId);

    // Cooldown do "Gerar agora": travado AGORA com a cadência-base da frequência
    // ATUAL (diária=1d, 3 dias=3d, semanal=7d). Mudar a frequência depois NÃO
    // encurta (o valor já ficou gravado). Best-effort e SEPARADO: se a migration
    // 0014 ainda não foi aplicada, este update falha em silêncio sem derrubar a
    // entrega nem o update acima.
    const baseDias = frequenciaParaJanela(input.profile.frequencia).baseDias;
    const cooldownUntilISO = new Date(Date.now() + baseDias * 24 * 60 * 60 * 1000).toISOString();
    const { error: cooldownErr } = await supabase
      .from('profiles')
      .update({ sample_cooldown_until: cooldownUntilISO })
      .eq('user_id', input.userId);
    if (cooldownErr) {
      console.warn(`[delivery] sample_cooldown_until não gravado (migration 0014 aplicada?): ${cooldownErr.message}`);
    }

    return {
      deliveryId,
      briefingId,
      status: 'sent',
      resendId: sendData?.id,
      itemsCount: briefing.itens.length,
      costBrl,
      elapsedSeconds: (Date.now() - t0) / 1000,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (deliveryId) {
      await supabase
        .from('deliveries')
        .update({ status: 'failed', error_message: message })
        .eq('id', deliveryId);
    }
    return {
      deliveryId,
      briefingId,
      status: 'failed',
      error: message,
      costBrl,
      elapsedSeconds: (Date.now() - t0) / 1000,
    };
  }
}
