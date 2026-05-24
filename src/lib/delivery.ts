import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateBriefing, generateEmail } from './pipeline';
import type { Profile } from './types';

export interface DeliveryInput {
  userId: string;
  email: string;
  profile: Profile;
}

export interface DeliveryOptions {
  dryRun?: boolean;
  overrideTo?: string;
}

export type DeliveryStatus = 'sent' | 'failed' | 'skipped_empty' | 'dry_run';

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
    const { briefing, meta: curateMeta } = await generateBriefing(input.profile);
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

    const to = opts.overrideTo ?? process.env.RESEND_OVERRIDE_TO ?? input.email;
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

    await supabase
      .from('profiles')
      .update({ last_delivered_at: new Date().toISOString() })
      .eq('user_id', input.userId);

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
