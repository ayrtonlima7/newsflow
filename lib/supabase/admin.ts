import { createClient } from '@supabase/supabase-js';

// Cliente com chave secreta — bypassa RLS. NUNCA expor ao browser.
// Use só em: cron handler, server actions privilegiadas, scripts admin.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
