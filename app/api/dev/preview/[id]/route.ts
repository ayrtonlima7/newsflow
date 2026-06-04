import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dev-only: serve o HTML de um delivery pra preview inline na UI.
 * Em produção retorna 404. Sem auth — só funciona em NODE_ENV === 'development'.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Invalid id', { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select('html')
    .eq('id', id)
    .maybeSingle();

  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data?.html) return new NextResponse('Delivery não encontrado', { status: 404 });

  return new NextResponse(data.html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
