'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

/**
 * Em modo dev, em vez de mandar magic link por email, o servidor:
 *   1. Cria o usuário se não existir
 *   2. Gera o link via admin
 *   3. Segue o link internamente e extrai os tokens
 *   4. Cria a sessão via SSR client (cookies)
 *   5. Redireciona pra onboarding/settings
 *
 * Resultado: usuário digita email, clica "Enviar", e tá logado.
 * Sem precisar abrir email, sem precisar clicar em link.
 */
const IS_DEV_AUTH_MOCK = process.env.NODE_ENV === 'development';

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/onboarding');

  if (!email || !email.includes('@')) {
    return { status: 'error', message: 'Digite um email válido.' };
  }

  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ??
    `http://${headerStore.get('host') ?? 'localhost:3000'}`;
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;

  // =====================================================================
  // DEV: bypass total — auto-login server-side
  // =====================================================================
  if (IS_DEV_AUTH_MOCK) {
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    try {
      const admin = createAdminClient();

      // 1. Garante que o usuário existe
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const exists = list?.users.some((u) => u.email?.toLowerCase() === email);
      if (!exists) {
        const { error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (createErr) {
          return { status: 'error', message: `[dev] createUser: ${createErr.message}` };
        }
      }

      // 2. Gera o magic link
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });
      if (error) {
        return { status: 'error', message: `[dev] generateLink: ${error.message}` };
      }
      const actionLink = data?.properties?.action_link;
      if (!actionLink) {
        return { status: 'error', message: '[dev] action_link ausente' };
      }

      // 3. Segue o link internamente (não redireciona o browser)
      const verifyRes = await fetch(actionLink, { redirect: 'manual' });
      const location = verifyRes.headers.get('location');
      if (!location) {
        return { status: 'error', message: '[dev] sem Location no verify' };
      }

      // 4. Tokens vêm no fragment da URL de redirect
      const hashIndex = location.indexOf('#');
      if (hashIndex === -1) {
        return { status: 'error', message: '[dev] sem fragmento de tokens na URL' };
      }
      const params = new URLSearchParams(location.slice(hashIndex + 1));
      accessToken = params.get('access_token');
      refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        return { status: 'error', message: '[dev] tokens ausentes no fragmento' };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', message: `[dev] erro inesperado: ${msg}` };
    }

    // 5. Cria a sessão via SSR client (seta os cookies httpOnly)
    const supabase = await createClient();
    const { error: sessionErr } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionErr) {
      return { status: 'error', message: `[dev] setSession: ${sessionErr.message}` };
    }

    // 6. Redirect — Next.js manda o browser pra essa rota
    //    (fora do try/catch porque redirect() throws e Next precisa rethrow)
    redirect(next as never);
  }

  // =====================================================================
  // PROD: fluxo normal, signInWithOtp manda email via Resend
  // =====================================================================
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  return { status: 'sent', email };
}

/**
 * Login social com Google (OAuth/PKCE). Roda no server client pra o code_verifier
 * ser gravado em cookie e lido depois no /auth/confirm (exchangeCodeForSession).
 * O Google manda o usuário de volta pro /auth/confirm?code=...&next=...
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = String(formData.get('next') ?? '/onboarding');

  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ??
    `http://${headerStore.get('host') ?? 'localhost:3000'}`;
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}` as never,
    );
  }
  // Redireciona o browser pra tela de consentimento do Google.
  redirect((data.url ?? '/login?error=oauth-sem-url') as never);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
