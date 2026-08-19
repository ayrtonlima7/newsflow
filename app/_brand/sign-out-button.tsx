'use client';

import { signOut } from '@/app/login/actions';
import { useT } from '../_i18n/provider';

/**
 * Botão "Sair" global — renderizado no chrome do layout em TODA página autenticada.
 *
 * Por quê: antes o logout existia só em /settings. Quem entrava logado sem perfil
 * salvo caía em /onboarding e ficava PRESO (a home redireciona logado → /settings,
 * que redireciona sem-perfil → /onboarding). Sem saída, não dava pra trocar de
 * conta. Aqui no chrome, qualquer página logada tem a saída disponível.
 */
export function SignOutButton() {
  const t = useT();
  return (
    <form action={signOut}>
      <button
        type="submit"
        title={t('settings.signOut')}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg)] transition hover:border-[var(--color-fg)]"
      >
        {t('settings.signOut')}
      </button>
    </form>
  );
}
