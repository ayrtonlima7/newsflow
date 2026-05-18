import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/settings');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) redirect('/onboarding');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-[var(--color-muted)]">{user.email}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Seu perfil</h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm hover:border-[var(--color-fg)]"
          >
            Sair
          </button>
        </form>
      </div>

      {welcome && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ Perfil salvo! O primeiro email vai chegar no horário e frequência que você escolheu.
        </div>
      )}

      <dl className="space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-6 text-sm">
        <Row label="Área">{profile.area}</Row>
        <Row label="Cargo">{profile.cargo}</Row>
        <Row label="Tópicos">
          <Chips items={profile.topicos} />
        </Row>
        <Row label="Ignorar">
          <Chips items={profile.ignorar} muted />
        </Row>
        <Row label="Frequência">{profile.frequencia}</Row>
        <Row label="Horário">{profile.horario}</Row>
        <Row label="Tom">{profile.tom}</Row>
        <Row label="Fontes prioritárias">
          <Chips items={profile.fontes_prioritarias} />
        </Row>
        <Row label="Status">
          {profile.is_active ? (
            <span className="text-emerald-700">Ativo</span>
          ) : (
            <span className="text-[var(--color-muted)]">Pausado</span>
          )}
        </Row>
      </dl>

      <p className="text-sm text-[var(--color-muted)]">
        A edição inline do perfil chega no chunk 4. Por enquanto você pode visualizar aqui.
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Chips({ items, muted }: { items: string[] | null; muted?: boolean }) {
  if (!items || items.length === 0) {
    return <span className="text-[var(--color-muted)] font-normal">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={
            muted
              ? 'rounded-full bg-stone-100 px-3 py-0.5 text-xs text-[var(--color-muted)] font-normal'
              : 'rounded-full bg-stone-100 px-3 py-0.5 text-xs font-normal'
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
