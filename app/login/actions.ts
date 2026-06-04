'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string; devLink?: string }
  | { status: 'error'; message: string };

/**
 * Indica se estamos em modo dev — onde o magic link é gerado via admin
 * e devolvido pro client em vez de mandar email. Permite testar sem depender
 * de entrega de email. Em produção (NODE_ENV !== 'development'), a flag fica
 * sempre falsa.
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
  // DEV: gera link via admin e devolve pro client (sem enviar email)
  // =====================================================================
  if (IS_DEV_AUTH_MOCK) {
    try {
      const admin = createAdminClient();

      // Garante que o usuário existe (admin.generateLink type=magiclink só
      // funciona pra usuários já existentes)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const exists = list?.users.some(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!exists) {
        const { error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true, // marca como confirmado pra pular verificação extra
        });
        if (createErr) {
          return { status: 'error', message: `[dev] createUser: ${createErr.message}` };
        }
      }

      // Gera o magic link
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });
      if (error) {
        return { status: 'error', message: `[dev] generateLink: ${error.message}` };
      }
      const devLink = data?.properties?.action_link;
      if (!devLink) {
        return { status: 'error', message: '[dev] magic link não veio na resposta' };
      }

      return { status: 'sent', email, devLink };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', message: `[dev] erro: ${msg}` };
    }
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
