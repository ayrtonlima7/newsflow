import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function confirmPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entregas pausadas — NewsFlow AI</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         max-width: 32rem; margin: 0 auto; padding: 4rem 1.5rem; color: #1c1917;
         background: #fafaf9; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem 0; }
  p { color: #44403c; line-height: 1.6; margin: 0 0 1rem 0; }
  a { color: #1c1917; }
  .card { background: white; border: 1px solid #e7e5e4; border-radius: .5rem; padding: 2rem; }
  .footer { font-size: .875rem; margin-top: 1.5rem; color: #78716c; }
</style>
</head>
<body>
  <div class="card">
    <h1>Entregas pausadas ✓</h1>
    <p>Você não vai receber mais emails do NewsFlow. Se mudar de ideia, é só reativar nas configurações.</p>
  </div>
  <p class="footer"><a href="/settings">Reativar / editar perfil</a></p>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Erro</title>
<style>body{font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#1c1917}</style>
</head>
<body>
  <h1 style="font-size:1.25rem">Não consegui processar o cancelamento</h1>
  <p style="color:#57534e">${message}</p>
  <p><a href="/">Voltar</a></p>
</body>
</html>`;
}

async function unsubscribe(id: string | null): Promise<
  { ok: true } | { ok: false; status: number; message: string }
> {
  if (!id) return { ok: false, status: 400, message: 'parâmetro id ausente' };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, message: 'id inválido' };

  const supabase = createAdminClient();

  const { data: delivery, error: selErr } = await supabase
    .from('deliveries')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return { ok: false, status: 500, message: selErr.message };
  if (!delivery) return { ok: false, status: 404, message: 'email não encontrado' };

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('user_id', delivery.user_id);
  if (updErr) return { ok: false, status: 500, message: updErr.message };

  return { ok: true };
}

// Gmail/Outlook fazem POST one-click (RFC 8058). Resposta não precisa de body.
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const result = await unsubscribe(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return new NextResponse(null, { status: 200 });
}

// GET é pro usuário clicar no link no email/header e ver confirmação visual.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const result = await unsubscribe(id);
  if (!result.ok) {
    return new NextResponse(errorPage(result.message), {
      status: result.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new NextResponse(confirmPage(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
