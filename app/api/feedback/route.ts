import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function thanksPage(value: 'up' | 'down', alreadyRegistered = false): string {
  const heading = value === 'up' ? 'Anotado! 🙌' : 'Anotado.';
  const body =
    value === 'up'
      ? 'Vou continuar curando nessa direção. Se quiser ajustar tópicos ou tom, é só editar seu perfil.'
      : 'Vou recalibrar a curadoria pros próximos emails. Pra acelerar o ajuste, vale editar seus tópicos ou o campo "ignorar".';
  const second = alreadyRegistered
    ? '<p style="font-size:.875rem;color:#78716c;margin-top:1rem;">(feedback atualizado)</p>'
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Obrigado pelo feedback — NewsFlow AI</title>
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
    <h1>${heading}</h1>
    <p>${body}</p>
    ${second}
  </div>
  <p class="footer"><a href="/settings">← Editar perfil</a></p>
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
  <h1 style="font-size:1.25rem">Não consegui registrar seu feedback</h1>
  <p style="color:#57534e">${message}</p>
  <p><a href="/">Voltar</a></p>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const v = req.nextUrl.searchParams.get('v');

  if (!id || !v || (v !== 'up' && v !== 'down')) {
    return new NextResponse(errorPage('parâmetros inválidos'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse(errorPage('id inválido'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const supabase = createAdminClient();

  const { data: existing, error: selErr } = await supabase
    .from('deliveries')
    .select('id, feedback')
    .eq('id', id)
    .maybeSingle();

  if (selErr) {
    return new NextResponse(errorPage(selErr.message), {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  if (!existing) {
    return new NextResponse(errorPage('email não encontrado'), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const alreadyRegistered = existing.feedback !== null;

  const { error: updErr } = await supabase
    .from('deliveries')
    .update({ feedback: v })
    .eq('id', id);

  if (updErr) {
    return new NextResponse(errorPage(updErr.message), {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return new NextResponse(thanksPage(v, alreadyRegistered), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
