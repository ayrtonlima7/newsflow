import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDeliveryPipeline } from '@/src/lib/delivery';
import type { Profile } from '@/src/lib/types';
import { normalizeFrequencia } from '@/src/lib/onboarding-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const SP_OFFSET_HOURS = -3;

function spHourNow(now: Date): number {
  return (now.getUTCHours() + SP_OFFSET_HOURS + 24) % 24;
}

/** Extrai a hora cheia de um horário em qualquer formato comum:
 *  "08:00", "8:00", "08", "8", "8h", "20:30" (MM ignorado). */
function parseHorario(horario: string): number | null {
  const m = horario.trim().match(/^(\d{1,2})(?::\d{2})?\s*h?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Data-calendário SP (YYYY-MM-DD) de um instante. SP = UTC-3. */
function spDateString(d: Date): string {
  const sp = new Date(d.getTime() + SP_OFFSET_HOURS * 3600_000);
  return sp.toISOString().split('T')[0];
}

/**
 * Já entregou nesta "janela" da frequência? Idempotência por período, não por
 * "X horas desde o último envio" — assim um teste manual ontem NÃO bloqueia o
 * agendado de hoje.
 *
 * - Diária: bloqueia se já entregou no MESMO dia-calendário SP.
 * - 3 dias / semanal: janela deslizante com folga (2.5d / 6d) pra absorver drift,
 *   mas sem barrar o ciclo seguinte (ex: semanal toda sexta 06:00 = exatamente 7d).
 */
function alreadyDeliveredThisPeriod(
  frequencia: string,
  lastDeliveredAt: string,
  now: Date,
): boolean {
  const slug = normalizeFrequencia(frequencia);
  const last = new Date(lastDeliveredAt);

  // Diária → comparação de dia-calendário
  if (slug === 'daily') {
    return spDateString(last) === spDateString(now);
  }

  // 3 dias / semanal → janela deslizante com folga
  const diffDays = (now.getTime() - last.getTime()) / (24 * 3600_000);
  if (slug === 'weekly') return diffDays < 6;
  return diffDays < 2.5; // every3days
}

type ProfileRow = Profile & {
  user_id: string;
  is_active: boolean;
  last_delivered_at: string | null;
};

function isDue(
  profile: ProfileRow,
  now: Date,
): { due: true } | { due: false; reason: string } {
  if (!profile.is_active) return { due: false, reason: 'inativo' };

  const targetHour = parseHorario(profile.horario);
  if (targetHour === null) {
    return { due: false, reason: `horário inválido: "${profile.horario}"` };
  }

  // Cron roda no minuto 45 UTC de cada hora via GitHub Actions, que pode
  // atrasar 5-15min. Pra absorver isso, aceita janela de tolerância de ±1h:
  // - currentSpHour + 1 (cron rodou no horário, prep pra próxima hora)
  // - currentSpHour     (cron atrasou e tá na hora-alvo)
  // - currentSpHour - 1 (cron atrasou muito; idempotência via last_delivered_at impede duplicata)
  const currentSpHour = spHourNow(now);
  const tolerantHours = [
    (currentSpHour + 1) % 24,
    currentSpHour,
    (currentSpHour + 24 - 1) % 24,
  ];
  if (!tolerantHours.includes(targetHour)) {
    return {
      due: false,
      reason: `hora SP atual ${currentSpHour}h, alvo do usuário ${targetHour}h (janela ${tolerantHours.join('/')}h)`,
    };
  }

  // Idempotência por período (não por "X horas") — teste manual ontem não
  // bloqueia o agendado de hoje. Protege contra cron disparar 2x na mesma janela.
  if (
    profile.last_delivered_at &&
    alreadyDeliveredThisPeriod(profile.frequencia, profile.last_delivered_at, now)
  ) {
    return {
      due: false,
      reason: `já entregue nesta janela (última: ${profile.last_delivered_at})`,
    };
  }

  return { due: true };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET não configurado' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  const forceUserId = req.nextUrl.searchParams.get('user_id');
  const ignoreSchedule = req.nextUrl.searchParams.get('force') === '1';

  const supabase = createAdminClient();
  const now = new Date();

  let query = supabase.from('profiles').select('*').eq('is_active', true);
  if (forceUserId) query = query.eq('user_id', forceUserId);

  const { data: profiles, error: pErr } = await query;
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const results: Array<{
    user_id: string;
    status: string;
    reason?: string;
    delivery_id?: string | null;
    items?: number;
    cost_brl?: number;
    error?: string;
  }> = [];

  for (const row of profiles ?? []) {
    const profile = row as ProfileRow;

    if (!ignoreSchedule) {
      const due = isDue(profile, now);
      if (!due.due) {
        results.push({ user_id: profile.user_id, status: 'skipped', reason: due.reason });
        continue;
      }
    }

    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(
      profile.user_id,
    );
    if (uErr || !userData.user?.email) {
      results.push({
        user_id: profile.user_id,
        status: 'failed',
        reason: 'usuário/email não encontrado em auth',
      });
      continue;
    }

    const result = await runDeliveryPipeline(
      {
        userId: profile.user_id,
        email: userData.user.email,
        profile: {
          nome: profile.nome ?? '',
          tema: profile.tema ?? [],
          contexto: profile.contexto ?? [],
          descricao_livre: profile.descricao_livre ?? '',
          objetivo: profile.objetivo ?? [],
          topicos: profile.topicos ?? [],
          topicos_busca: profile.topicos_busca ?? undefined,
          referencias: profile.referencias ?? [],
          formatos: profile.formatos ?? [],
          ignorar: profile.ignorar ?? [],
          frequencia: profile.frequencia ?? '',
          horario: profile.horario ?? '8h',
          delivery_email: profile.delivery_email ?? undefined,
          idioma: profile.idioma ?? 'pt',
        },
      },
      // force=1 também pula o gate de assinatura (pra admin testar)
      { dryRun, skipGate: ignoreSchedule },
    );

    results.push({
      user_id: profile.user_id,
      status: result.status,
      delivery_id: result.deliveryId,
      items: result.itemsCount,
      cost_brl: result.costBrl,
      error: result.error,
    });
  }

  return NextResponse.json({
    timestamp: now.toISOString(),
    sp_hour: spHourNow(now),
    dry_run: dryRun,
    force_user_id: forceUserId,
    ignore_schedule: ignoreSchedule,
    processed: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped' || r.status === 'skipped_empty').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  });
}
