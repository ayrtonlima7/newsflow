import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStats } from '@/src/lib/admin-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: 'ADMIN_EMAIL não configurado nas envs' },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const stats = await getStats();
  return NextResponse.json(stats, { headers: { 'cache-control': 'no-store' } });
}
