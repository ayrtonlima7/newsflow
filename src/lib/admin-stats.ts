import { createAdminClient } from '@/lib/supabase/admin';

interface BriefingRow {
  meta: { cost?: { totalBRL?: number } } | null;
  created_at: string;
}

interface DeliveryRow {
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  feedback: 'up' | 'down' | null;
  created_at: string;
}

export interface WindowStats {
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

export interface AdminStats {
  now: string;
  note: string;
  users: {
    auth_users: number;
    profiles_total: number;
    profiles_active: number;
  };
  windows: {
    today: WindowStats;
    last_7_days: WindowStats;
    last_30_days: WindowStats;
  };
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

export async function getStats(): Promise<AdminStats> {
  const admin = createAdminClient();
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 3600_000);

  const [briefingsRes, deliveriesRes, profilesTotalRes, profilesActiveRes, authRes] =
    await Promise.all([
      admin
        .from('briefings')
        .select('meta, created_at')
        .gte('created_at', since30d.toISOString()),
      admin
        .from('deliveries')
        .select('status, feedback, created_at')
        .gte('created_at', since30d.toISOString()),
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const allBriefings = (briefingsRes.data ?? []) as BriefingRow[];
  const allDeliveries = (deliveriesRes.data ?? []) as DeliveryRow[];

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const since7d = new Date(now.getTime() - 7 * 24 * 3600_000);

  return {
    now: now.toISOString(),
    note: 'curate_cost_brl é apenas do curate (gravado em briefings.meta). Custo do email gen (~R$0.02/envio com DeepSeek) não é persistido hoje.',
    users: {
      auth_users: authRes.data?.users.length ?? 0,
      profiles_total: profilesTotalRes.count ?? 0,
      profiles_active: profilesActiveRes.count ?? 0,
    },
    windows: {
      today: computeWindow(allBriefings, allDeliveries, startOfToday),
      last_7_days: computeWindow(allBriefings, allDeliveries, since7d),
      last_30_days: computeWindow(allBriefings, allDeliveries, since30d),
    },
  };
}
