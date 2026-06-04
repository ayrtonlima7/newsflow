import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDeliveryPipeline } from '@/src/lib/delivery';
import type { Profile } from '@/src/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

/** Intervalo mínimo entre entregas, baseado na frequência. Casa com o que
 *  frequenciaParaJanela retorna em janelaDias. */
function minIntervalMs(frequencia: string): number {
  const f = frequencia.toLowerCase();
  if (f.includes('semana')) return 6 * 24 * 3600_000; // 6 dias (folga pra 7)
  if (f.includes('3 dias') || f.includes('três dias') || f.includes('tres dias')) {
    return 2.5 * 24 * 3600_000; // 2.5 dias (folga pra 3)
  }
  // Default: diária — 23h dá folga pra rodar 1x/dia
  return 23 * 3600_000;
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

  // Idempotência: respeitar frequência (não mandar 2 emails na mesma janela
  // — protege contra GitHub Actions firing 2x ou cron atrasado).
  if (profile.last_delivered_at) {
    const last = new Date(profile.last_delivered_at).getTime();
    const diff = now.getTime() - last;
    const min = minIntervalMs(profile.frequencia);
    if (diff < min) {
      const hoursAgo = (diff / 3600_000).toFixed(1);
      const minHours = (min / 3600_000).toFixed(0);
      return { due: false, reason: `última entrega há ${hoursAgo}h (min ${minHours}h)` };
    }
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
          contexto: profile.contexto ?? '',
          descricao_livre: profile.descricao_livre ?? '',
          objetivo: profile.objetivo ?? '',
          topicos: profile.topicos ?? [],
          topicos_busca: profile.topicos_busca ?? undefined,
          referencias: profile.referencias ?? [],
          formatos: profile.formatos ?? [],
          ignorar: profile.ignorar ?? [],
          frequencia: profile.frequencia ?? '',
          horario: profile.horario ?? '8h',
        },
      },
      { dryRun },
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
