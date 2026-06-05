import type { Briefing } from './types';

/** Escapa texto pra HTML (previne quebra de layout e injeção). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Converte quebras de linha simples do corpo em parágrafos/quebras HTML. */
function corpoToHtml(corpo: string): string {
  return esc(corpo.trim()).replace(/\n{2,}/g, '</p><p style="margin:0 0 12px 0;">').replace(/\n/g, '<br>');
}

/**
 * Monta o HTML do email a partir do briefing (conteúdo já na voz final).
 * O LLM NÃO gera HTML — só conteúdo estruturado. Aqui o template é fixo,
 * controlado e consistente (base pra identidade visual depois).
 *
 * Usa placeholders {{FEEDBACK_URL_YES/NO}} que delivery.ts substitui após
 * conhecer o delivery_id.
 */
export function renderEmailHtml(briefing: Briefing): string {
  const intro = briefing.intro?.trim() ?? '';

  const itemsHtml = briefing.itens
    .map((item) => {
      const titulo = esc(item.titulo);
      const fonte = esc(item.fonte);
      const url = item.url; // já validada
      return `
      <div style="margin:0 0 28px 0;padding:0 0 28px 0;border-bottom:1px solid #ececec;">
        <h2 style="margin:0 0 8px 0;font-size:18px;line-height:1.35;font-weight:600;">
          <a href="${url}" style="color:#1a1a1a;text-decoration:none;" target="_blank" rel="noopener">${titulo}</a>
        </h2>
        <p style="margin:0 0 8px 0;font-size:12px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.04em;">${fonte}</p>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#333;">${corpoToHtml(item.corpo)}</p>
        <a href="${url}" style="font-size:14px;color:#2563eb;text-decoration:none;" target="_blank" rel="noopener">Ler na fonte →</a>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(briefing.assunto ?? 'Seu resumo')}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;padding:32px 28px;">
      ${intro ? `<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#1a1a1a;">${corpoToHtml(intro)}</p>` : ''}
      ${itemsHtml}

      <div style="margin-top:8px;text-align:center;">
        <p style="margin:0 0 12px 0;font-size:14px;color:#555;">Isso foi útil?</p>
        <a href="{{FEEDBACK_URL_YES}}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#16a34a;color:#fff;text-decoration:none;font-size:14px;" target="_blank" rel="noopener">👍 Sim</a>
        <a href="{{FEEDBACK_URL_NO}}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#dc2626;color:#fff;text-decoration:none;font-size:14px;" target="_blank" rel="noopener">👎 Não</a>
      </div>
    </div>
    <p style="margin:20px 0 0 0;text-align:center;font-size:12px;color:#a1a1aa;">
      Você recebe esses emails porque configurou seu perfil no NewsFlow.
    </p>
  </div>
</body>
</html>`;
}
