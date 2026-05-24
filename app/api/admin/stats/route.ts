import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BriefingRow {
  meta: { cost?: { totalBRL?: number } } | null;
  created_at: string;
}

interface DeliveryRow {
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  feedback: 'up' | 'down' | null;
  created_at: string;
}

interface WindowStats {
  briefings: number;
  deliveries: {
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  feedback: { up: number; down: number };
  curate_cost_brl: number;
}

function isAfter(iso: string, since: Date): boolean {
  return new Date(iso).getTime() >= since.getTime();
}

function computeWindow(
  briefings: BriefingRow[],
  deliveries: DeliveryRow[],
  since: Date,
): WindowStats {
  const b = briefings.filter((row) => isAfter(row.created_at, since));
  const d = deliveries.filter((row) => isAfter(row.created_at, since));

  const cost = b.reduce((sum, row) => sum + (row.meta?.cost?.totalBRL ?? 0), 0);

  return {
    briefings: b.length,
    deliveries: {
      sent: d.filter((x) => x.status === 'sent').length,
      failed: d.filter((x) => x.status === 'failed').length,
      skipped: d.filter((x) => x.status === 'skipped').length,
      pending: d.filter((x) => x.status === 'pending').length,
    },
    feedback: {
      up: d.filter((x) => x.feedback === 'up').length,
      down: d.filter((x) => x.feedback === 'down').length,
    },
    curate_cost_brl: Number(cost.toFixed(4)),
  };
}

export async function GET() {
  // Auth: usuário logado + email tem que bater com ADMIN_EMAIL
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: 'ADMIN_EMAIL não configurado nas envs' },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 3600_000);

  // Puxa tudo dos últimos 30 dias uma vez só e fatia em memória
  const [{ data: briefings, error: bErr }, { data: deliveries, error: dErr }] =
    await Promise.all([
      admin
        .from('briefings')
        .select('meta, created_at')
        .gte('created_at', since30d.toISOString()),
      admin
        .from('deliveries')
        .select('status, feedback, created_at')
        .gte('created_at', since30d.toISOString()),
    ]);

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const allBriefings = (briefings ?? []) as BriefingRow[];
  const allDeliveries = (deliveries ?? []) as DeliveryRow[];

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const since7d = new Date(now.getTime() - 7 * 24 * 3600_000);

  // Usuários — separado, sem janela de tempo
  const { count: profilesTotal } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  const { count: profilesActive } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);
  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUsers = authData?.users.length ?? 0;

  return NextResponse.json(
    {
      now: now.toISOString(),
      note: 'curate_cost_brl é só do curate (gravado em briefings.meta). Custo do email gen (~R$0.02/envio com DeepSeek) não é persistido hoje.',
      users: {
        auth_users: authUsers,
        profiles_total: profilesTotal ?? 0,
        profiles_active: profilesActive ?? 0,
      },
      windows: {
        today: computeWindow(allBriefings, allDeliveries, startOfToday),
        last_7_days: computeWindow(allBriefings, allDeliveries, since7d),
        last_30_days: computeWindow(allBriefings, allDeliveries, since30d),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
