import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';
import { SettingsForm } from './settings-form';

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

  const initial = {
    area: profile.area,
    cargo: profile.cargo,
    topicos: profile.topicos ?? [],
    ignorar: profile.ignorar ?? [],
    frequencia: profile.frequencia,
    horario: profile.horario,
    tom: profile.tom,
    fontes_prioritarias: profile.fontes_prioritarias ?? [],
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-[var(--color-muted)]">{user.email}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Seu perfil</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Edite o que quiser e clique em salvar. A curadoria considera essas configurações
            no próximo envio.
          </p>
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

      <SettingsForm initial={initial} isActive={profile.is_active} />
    </main>
  );
}
