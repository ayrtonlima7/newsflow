'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isLocale, LOCALE_COOKIE } from '@/src/lib/i18n';

/**
 * Troca o idioma. Sempre grava o cookie (vale pré-login e em qualquer página).
 * Se o usuário estiver logado, sincroniza profile.idioma — assim a curadoria e
 * os emails passam a sair no mesmo idioma da UI.
 */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 ano
    sameSite: 'lax',
  });

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ idioma: locale }).eq('user_id', user.id);
    }
  } catch {
    // pré-login ou sem perfil — o cookie já basta pra UI.
  }

  return { ok: true };
}
