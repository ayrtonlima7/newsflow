import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next') ?? '/onboarding';

  const supabase = await createClient();

  // PKCE flow (padrão atual do @supabase/ssr)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(next);
  }

  // Fallback: token_hash flow (formato antigo)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(next);
  }

  redirect('/login?error=missing-token');
}
