import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './wizard';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/onboarding');

  // Se já tem perfil, manda para settings (onde pode editar)
  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) redirect('/settings');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-muted)]">
          NewsFlow AI
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Vamos montar seu perfil</h1>
        <p className="text-[var(--color-muted)]">
          São 8 perguntas rápidas. Vou usar isso para curar conteúdo todo dia só para você.
        </p>
      </div>
      <OnboardingWizard userEmail={user.email ?? ''} />
    </main>
  );
}
