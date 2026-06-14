import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getLocale } from './_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';
import { LoginForm } from './login/login-form';
import { Logo } from './_brand/logo';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Já logado → vai direto pro app (settings é o hub). Quem não tem perfil
  // ainda cai em /onboarding por lá.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/settings');

  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = (k: string) => translate(dict, k);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Coluna esquerda — marca, copy e login */}
        <div className="flex flex-col gap-7">
          <Logo size={34} />

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              {t('landing.eyebrow')}
            </p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight md:text-5xl">
              {t('landing.title')}
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-[var(--color-muted)]">
              {t('landing.subtitle')}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/50 bg-[var(--color-surface)] px-4 py-3 text-sm shadow-sm">
              <p className="font-medium text-red-500">{t('login.errorTitle')}</p>
              <p className="text-[var(--color-muted)]">{error}</p>
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
            <p className="text-sm text-[var(--color-muted)]">{t('landing.authNote')}</p>
            <LoginForm next={next} />
          </div>
        </div>

        {/* Coluna direita — vitrine do produto (email real) */}
        <div className="relative order-first lg:order-last">
          {/* brilho indigo atrás da peça */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[var(--color-accent)] opacity-[0.12] blur-3xl"
          />
          <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/email-hero-${locale}.png`}
              alt="NewsFlow"
              className="block max-h-[360px] w-full object-cover object-top lg:max-h-[560px]"
            />
            {/* fade do rodapé pra fundir com o fundo da página (claro/escuro) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{ background: 'linear-gradient(to bottom, transparent, var(--color-bg))' }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
