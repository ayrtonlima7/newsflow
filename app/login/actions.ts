'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/onboarding');

  if (!email || !email.includes('@')) {
    return { status: 'error', message: 'Digite um email válido.' };
  }

  const supabase = await createClient();
  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ??
    `http://${headerStore.get('host') ?? 'localhost:3000'}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
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
