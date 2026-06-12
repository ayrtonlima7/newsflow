import type { Briefing } from './types';
import { HTML_LANG, INTL_LOCALE, type Locale } from './i18n';

/** Strings fixas do email (chrome) por idioma. O conteúdo (assunto/intro/corpo)
 *  já vem traduzido do briefing; aqui é só a moldura. */
const CHROME: Record<Locale, {
  readSource: string;
  helpful: string;
  yes: string;
  no: string;
  footer: string;
  titleFallback: string;
}> = {
  pt: {
    readSource: 'Ler na fonte →',
    helpful: 'Isso foi útil?',
    yes: '👍 Sim',
    no: '👎 Não',
    footer: 'Você recebe esses emails porque configurou seu perfil no NewsFlow.',
    titleFallback: 'Seu resumo',
  },
  en: {
    readSource: 'Read at source →',
    helpful: 'Was this helpful?',
    yes: '👍 Yes',
    no: '👎 No',
    footer: 'You receive these emails because you set up your profile on NewsFlow.',
    titleFallback: 'Your briefing',
  },
  es: {
    readSource: 'Leer en la fuente →',
    helpful: '¿Te resultó útil?',
    yes: '👍 Sí',
    no: '👎 No',
    footer: 'Recibes estos emails porque configuraste tu perfil en NewsFlow.',
    titleFallback: 'Tu resumen',
  },
};

/** Escapa texto pra HTML (previne quebra de layout e injeção). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formata a data de publicação (YYYY-MM-DD) pro idioma do leitor. Retorna ''
 * quando a data está ausente/inválida (não renderiza nada nesse caso — melhor
 * sem data do que "Invalid Date"). Usa timeZone UTC pra não deslocar o dia.
 */
export function formatItemDate(date: string | undefined, locale: Locale): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
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
export function renderEmailHtml(briefing: Briefing, locale: Locale = 'pt'): string {
  const t = CHROME[locale];
  const intro = briefing.intro?.trim() ?? '';

  const itemsHtml = briefing.itens
    .map((item) => {
      const titulo = esc(item.titulo);
      const fonte = esc(item.fonte);
      const data = formatItemDate(item.data_publicacao, locale);
      // fonte · data (a data só aparece quando válida)
      const meta = data ? `${fonte} &middot; ${esc(data)}` : fonte;
      const url = item.url; // já validada
      return `
      <div style="margin:0 0 28px 0;padding:0 0 28px 0;border-bottom:1px solid #ececec;">
        <h2 style="margin:0 0 8px 0;font-size:18px;line-height:1.35;font-weight:600;">
          <a href="${url}" style="color:#1a1a1a;text-decoration:none;" target="_blank" rel="noopener">${titulo}</a>
        </h2>
        <p style="margin:0 0 8px 0;font-size:12px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.04em;">${meta}</p>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#333;">${corpoToHtml(item.corpo)}</p>
        <a href="${url}" style="font-size:14px;color:#2563eb;text-decoration:none;" target="_blank" rel="noopener">${t.readSource}</a>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${HTML_LANG[locale]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(briefing.assunto ?? t.titleFallback)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;padding:32px 28px;">
      ${intro ? `<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#1a1a1a;">${corpoToHtml(intro)}</p>` : ''}
      ${itemsHtml}

      <div style="margin-top:8px;text-align:center;">
        <p style="margin:0 0 12px 0;font-size:14px;color:#555;">${t.helpful}</p>
        <a href="{{FEEDBACK_URL_YES}}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#16a34a;color:#fff;text-decoration:none;font-size:14px;" target="_blank" rel="noopener">${t.yes}</a>
        <a href="{{FEEDBACK_URL_NO}}" style="display:inline-block;margin:0 6px;padding:8px 18px;border-radius:8px;background:#dc2626;color:#fff;text-decoration:none;font-size:14px;" target="_blank" rel="noopener">${t.no}</a>
      </div>
    </div>
    <p style="margin:20px 0 0 0;text-align:center;font-size:12px;color:#a1a1aa;">
      ${t.footer}
    </p>
  </div>
</body>
</html>`;
}
