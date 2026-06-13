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

export type EmailTheme = 'light' | 'dark';

/** Tokens de cor por tema. O header (gradiente indigo + badge branco "N" +
 *  wordmark) e os botões de feedback (emerald/red) são IGUAIS nos dois temas —
 *  só o "chrome" do corpo muda. */
interface ThemeTokens {
  bodyBg: string;
  cardBg: string;
  cardBorder: string;
  intro: string;
  title: string;
  meta: string;
  body: string;
  link: string;
  divider: string;
  helpful: string;
  footer: string;
}

const THEMES: Record<EmailTheme, ThemeTokens> = {
  light: {
    bodyBg: '#F8FAFC', cardBg: '#ffffff', cardBorder: '#E2E8F0',
    intro: '#0F172A', title: '#0F172A', meta: '#64748B', body: '#334155',
    link: '#4F46E5', divider: '#E2E8F0', helpful: '#64748B', footer: '#94A3B8',
  },
  dark: {
    bodyBg: '#0F172A', cardBg: '#1E293B', cardBorder: '#334155',
    intro: '#E2E8F0', title: '#F1F5F9', meta: '#64748B', body: '#94A3B8',
    link: '#818CF8', divider: '#334155', helpful: '#64748B', footer: '#64748B',
  },
};

/** Resolve o tema: opção explícita → env `EMAIL_THEME` → 'light' (default).
 *  Default light mantém produção intacta; pra flipar pra dark depois, basta
 *  setar `EMAIL_THEME=dark` (sem mexer no código). ⚠️ dark mode em email é
 *  instável em alguns clients (Gmail dark inverte cores) — ver docs. */
function resolveTheme(explicit?: EmailTheme): EmailTheme {
  if (explicit) return explicit;
  return process.env.EMAIL_THEME === 'dark' ? 'dark' : 'light';
}

/**
 * Monta o HTML do email a partir do briefing (conteúdo já na voz final).
 * O LLM NÃO gera HTML — só conteúdo estruturado. Aqui o template é fixo,
 * controlado e consistente (base pra identidade visual depois).
 *
 * `opts.theme` escolhe light (default, produção) ou dark; sem opção, cai no env
 * `EMAIL_THEME`. Usa placeholders {{FEEDBACK_URL_YES/NO}} que delivery.ts
 * substitui após conhecer o delivery_id.
 */
export function renderEmailHtml(
  briefing: Briefing,
  locale: Locale = 'pt',
  opts: { theme?: EmailTheme } = {},
): string {
  const t = CHROME[locale];
  const c = THEMES[resolveTheme(opts.theme)];
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
      <div style="margin:0 0 28px 0;padding:0 0 28px 0;border-bottom:1px solid ${c.divider};">
        <h2 style="margin:0 0 8px 0;font-size:18px;line-height:1.35;font-weight:600;">
          <a href="${url}" style="color:${c.title};text-decoration:none;" target="_blank" rel="noopener">${titulo}</a>
        </h2>
        <p style="margin:0 0 10px 0;font-size:12px;color:${c.meta};text-transform:uppercase;letter-spacing:0.04em;">${meta}</p>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:${c.body};">${corpoToHtml(item.corpo)}</p>
        <a href="${url}" style="font-size:14px;font-weight:600;color:${c.link};text-decoration:none;" target="_blank" rel="noopener">${t.readSource}</a>
      </div>`;
    })
    .join('\n');

  // Data da edição no header (formato amigável; vazio se ausente/inválida).
  const headerDate = formatItemDate(briefing.data_referencia, locale);

  return `<!DOCTYPE html>
<html lang="${HTML_LANG[locale]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(briefing.assunto ?? t.titleFallback)}</title>
</head>
<body style="margin:0;padding:0;background:${c.bodyBg};">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="border-radius:14px;overflow:hidden;border:1px solid ${c.cardBorder};background:${c.cardBg};">
      <!-- Header de marca: gradiente indigo (cor sólida de fallback p/ clients sem gradient) -->
      <div style="background-color:#4F46E5;background-image:linear-gradient(135deg,#312E81,#4F46E5);padding:22px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#ffffff;border-radius:9px;color:#4F46E5;font-size:20px;font-weight:700;vertical-align:middle;">N</span>
              <span style="margin-left:10px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;vertical-align:middle;">NewsFlow</span>
            </td>
            ${headerDate ? `<td style="vertical-align:middle;text-align:right;font-size:13px;color:#E0E7FF;">${esc(headerDate)}</td>` : ''}
          </tr>
        </table>
      </div>

      <!-- Conteúdo -->
      <div style="padding:32px 28px;">
        ${intro ? `<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:${c.intro};">${corpoToHtml(intro)}</p>` : ''}
        ${itemsHtml}

        <div style="margin-top:8px;text-align:center;">
          <p style="margin:0 0 12px 0;font-size:14px;color:${c.helpful};">${t.helpful}</p>
          <a href="{{FEEDBACK_URL_YES}}" style="display:inline-block;margin:0 6px;padding:9px 20px;border-radius:8px;background:#059669;color:#fff;text-decoration:none;font-size:14px;font-weight:600;" target="_blank" rel="noopener">${t.yes}</a>
          <a href="{{FEEDBACK_URL_NO}}" style="display:inline-block;margin:0 6px;padding:9px 20px;border-radius:8px;background:#DC2626;color:#fff;text-decoration:none;font-size:14px;font-weight:600;" target="_blank" rel="noopener">${t.no}</a>
        </div>
      </div>
    </div>
    <p style="margin:20px 0 0 0;text-align:center;font-size:12px;color:${c.footer};">
      ${t.footer}
    </p>
  </div>
</body>
</html>`;
}
