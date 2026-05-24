import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStats, type WindowStats } from '@/src/lib/admin-stats';
import { cn } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">Admin indisponível</h1>
        <p className="text-sm text-[var(--color-muted)]">
          A variável <code>ADMIN_EMAIL</code> não está configurada no servidor.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/admin');
  if (user.email !== adminEmail) redirect('/settings');

  const stats = await getStats();
  const updatedAt = new Date(stats.now).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/settings"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          >
            ← Voltar pro perfil
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Visão agregada do NewsFlow. Atualizado em {updatedAt}.
          </p>
        </div>
        <Link
          href="/api/admin/stats"
          target="_blank"
          rel="noopener"
          className="self-start rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs hover:border-[var(--color-fg)]"
        >
          Ver JSON cru ↗
        </Link>
      </header>

      <section className="space-y-3">
        <SectionLabel>Usuários</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Auth users" value={stats.users.auth_users} />
          <StatTile label="Perfis completos" value={stats.users.profiles_total} />
          <StatTile label="Ativos" value={stats.users.profiles_active} accent="emerald" />
        </div>
        {stats.users.auth_users > stats.users.profiles_total && (
          <p className="text-xs text-[var(--color-muted)]">
            {stats.users.auth_users - stats.users.profiles_total} usuário(s) cadastraram mas
            não terminaram o onboarding.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>Atividade</SectionLabel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <WindowCard title="Hoje" data={stats.windows.today} />
          <WindowCard title="Últimos 7 dias" data={stats.windows.last_7_days} />
          <WindowCard title="Últimos 30 dias" data={stats.windows.last_30_days} />
        </div>
      </section>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ {stats.note}
      </p>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
      {children}
    </h2>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-5',
        accent === 'emerald' ? 'border-emerald-300' : 'border-[var(--color-border)]',
      )}
    >
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p
        className={cn(
          'mt-2 text-3xl font-semibold tracking-tight',
          accent === 'emerald' && 'text-emerald-700',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function WindowCard({ title, data }: { title: string; data: WindowStats }) {
  const hasFeedback = data.feedback.up + data.feedback.down > 0;
  const positivityRate = hasFeedback
    ? Math.round((data.feedback.up / (data.feedback.up + data.feedback.down)) * 100)
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-medium">{title}</h3>
        <span className="text-xs text-[var(--color-muted)]">
          R$ {data.curate_cost_brl.toFixed(2)}
        </span>
      </div>

      <div className="space-y-1.5">
        <KV label="Briefings gerados" value={data.briefings} />
        <KV
          label="Custo (curate)"
          value={`R$ ${data.curate_cost_brl.toFixed(4)}`}
        />
      </div>

      <Divider />

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Deliveries
        </p>
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-emerald-700">✓ Enviados</span>
          <span className="text-right font-medium text-emerald-700">
            {data.deliveries.sent}
          </span>
          <span className="text-red-700">✗ Falhados</span>
          <span className="text-right font-medium text-red-700">
            {data.deliveries.failed}
          </span>
          <span className="text-[var(--color-muted)]">— Pulados</span>
          <span className="text-right font-medium">{data.deliveries.skipped}</span>
          {data.deliveries.pending > 0 && (
            <>
              <span className="text-amber-700">⏳ Pendentes</span>
              <span className="text-right font-medium text-amber-700">
                {data.deliveries.pending}
              </span>
            </>
          )}
        </div>
      </div>

      <Divider />

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Feedback
        </p>
        <div className="flex items-baseline justify-between text-sm">
          <div className="flex gap-3">
            <span>👍 {data.feedback.up}</span>
            <span>👎 {data.feedback.down}</span>
          </div>
          {positivityRate !== null && (
            <span
              className={cn(
                'text-xs font-medium',
                positivityRate >= 70 ? 'text-emerald-700' : 'text-amber-700',
              )}
            >
              {positivityRate}% positivo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--color-border)]" />;
}
