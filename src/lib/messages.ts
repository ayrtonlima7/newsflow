import { DEFAULT_LOCALE, type Locale } from './i18n';

/**
 * Catálogo de mensagens da UI. Chaves "planas" com namespace por ponto
 * (ex: 'login.title'). Interpolação simples de {var}.
 *
 * Server components: getDictionary(locale) + translate(dict, key).
 * Client components: useT() (ver app/_i18n/provider.tsx) — mesma função por baixo.
 *
 * A varredura de UI é incremental: chaves vão sendo adicionadas conforme cada
 * superfície é traduzida. Faltando uma chave, cai no texto PT (fallback visível).
 */

export type Dictionary = Record<string, string>;

const pt: Dictionary = {
  // genérico / nav
  'nav.signIn': 'Entrar',
  'nav.settings': 'Configurações',
  'lang.label': 'Idioma',

  // landing
  'landing.eyebrow': 'NewsFlow AI',
  'landing.title': 'Seu jornal customizado, escrito como um amigo te contaria.',
  'landing.subtitle':
    'Curadoria diária por IA das notícias que importam pra você — sem o ruído de redes sociais, sem manchetes infladas. Direto no seu email, no horário que você escolher.',
  'landing.ctaCreate': 'Criar meu perfil de curadoria',
  'landing.ctaLogin': 'Já tenho conta',

  // login
  'login.back': '← voltar',
  'login.title': 'Entrar no NewsFlow',
  'login.subtitle': 'Entre com sua conta Google ou por email. Sem senha, sem complicação.',
  'login.errorTitle': 'Não foi possível entrar.',
  'login.google': 'Continuar com Google',
  'login.preferEmail': 'Prefere entrar com email?',
  'login.orEmail': 'ou com email',
  'login.emailLabel': 'Email',
  'login.emailPlaceholder': 'voce@email.com',
  'login.sendMagic': 'Enviar link mágico',
  'login.sending': 'Enviando…',
  'login.sentTitle': 'Link mágico a caminho',
  'login.sentBody': 'Mandamos um link para {email}. Clica nele para entrar — pode levar até 1 minuto para chegar.',
  'login.sentSpam': 'Não chegou? Veja a pasta de spam. Ou tente de novo com outro email.',
};

const en: Dictionary = {
  'nav.signIn': 'Sign in',
  'nav.settings': 'Settings',
  'lang.label': 'Language',

  'landing.eyebrow': 'NewsFlow AI',
  'landing.title': 'Your custom briefing, written like a friend would tell you.',
  'landing.subtitle':
    'Daily AI curation of the news that matters to you — without the social-media noise or inflated headlines. Straight to your inbox, at the time you choose.',
  'landing.ctaCreate': 'Create my curation profile',
  'landing.ctaLogin': 'I already have an account',

  'login.back': '← back',
  'login.title': 'Sign in to NewsFlow',
  'login.subtitle': 'Sign in with your Google account or by email. No password, no hassle.',
  'login.errorTitle': "Couldn't sign you in.",
  'login.google': 'Continue with Google',
  'login.preferEmail': 'Prefer to sign in with email?',
  'login.orEmail': 'or with email',
  'login.emailLabel': 'Email',
  'login.emailPlaceholder': 'you@email.com',
  'login.sendMagic': 'Send magic link',
  'login.sending': 'Sending…',
  'login.sentTitle': 'Magic link on the way',
  'login.sentBody': 'We sent a link to {email}. Click it to sign in — it may take up to a minute to arrive.',
  'login.sentSpam': "Didn't get it? Check your spam folder. Or try again with another email.",
};

const es: Dictionary = {
  'nav.signIn': 'Entrar',
  'nav.settings': 'Configuración',
  'lang.label': 'Idioma',

  'landing.eyebrow': 'NewsFlow AI',
  'landing.title': 'Tu resumen a medida, escrito como te lo contaría un amigo.',
  'landing.subtitle':
    'Curaduría diaria por IA de las noticias que te importan — sin el ruido de las redes ni titulares inflados. Directo a tu correo, a la hora que elijas.',
  'landing.ctaCreate': 'Crear mi perfil de curaduría',
  'landing.ctaLogin': 'Ya tengo cuenta',

  'login.back': '← volver',
  'login.title': 'Entrar en NewsFlow',
  'login.subtitle': 'Entra con tu cuenta de Google o por correo. Sin contraseña, sin complicaciones.',
  'login.errorTitle': 'No fue posible entrar.',
  'login.google': 'Continuar con Google',
  'login.preferEmail': '¿Prefieres entrar con correo?',
  'login.orEmail': 'o con correo',
  'login.emailLabel': 'Correo',
  'login.emailPlaceholder': 'tu@correo.com',
  'login.sendMagic': 'Enviar enlace mágico',
  'login.sending': 'Enviando…',
  'login.sentTitle': 'Enlace mágico en camino',
  'login.sentBody': 'Enviamos un enlace a {email}. Haz clic para entrar — puede tardar hasta un minuto en llegar.',
  'login.sentSpam': '¿No llegó? Revisa la carpeta de spam. O intenta de nuevo con otro correo.',
};

const DICTS: Record<Locale, Dictionary> = { pt, en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

/** Resolve uma chave; interpola {var}. Fallback: PT, depois a própria chave. */
export function translate(
  dict: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let str = dict[key] ?? pt[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
