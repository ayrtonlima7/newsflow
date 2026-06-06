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

  // onboarding
  'onb.pageTitle': 'Vamos montar seu perfil',
  'onb.pageSubtitle': 'São algumas perguntas rápidas. Vou usar isso pra curar conteúdo só pra você.',
  'onb.progress': 'Pergunta {n} de {total}',
  'onb.back': 'Voltar',
  'onb.next': 'Próxima',
  'onb.review': 'Revisar',
  'onb.add': 'Adicionar',
  'onb.addAnother': 'Adicionar outro…',
  'onb.other': 'Outro: descreva',
  'onb.typeEnter': 'Digite e pressione Enter',
  'onb.genLoading': '✨ Gerando sugestões personalizadas para você…',
  'onb.combining': '✨ Combinando suas respostas e buscando sugestões pra você… (pode levar ~15s)',
  'onb.noIdeas': 'Sem ideias? Aqui vão sugestões pra você:',
  'onb.topicsErrorSuffix': 'Você ainda pode adicionar tópicos manualmente.',

  // confirmação do onboarding
  'confirm.title': 'Tudo certo?',
  'confirm.titleNamed': 'Tudo certo, {nome}?',
  'confirm.subtitle': 'Confere se está tudo como você quer. Pode editar a qualquer momento depois.',
  'confirm.name': 'Nome',
  'confirm.theme': 'Tema(s)',
  'confirm.context': 'Contexto',
  'confirm.about': 'Sobre você',
  'confirm.goal': 'Objetivo',
  'confirm.topics': 'Tópicos',
  'confirm.refs': 'Referências',
  'confirm.formats': 'Formatos',
  'confirm.ignore': 'Ignorar',
  'confirm.frequency': 'Frequência',
  'confirm.saving': 'Salvando…',
  'confirm.confirm': 'Confirmar e salvar',
  'confirm.backEdit': 'Voltar e editar',
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

  'onb.pageTitle': "Let's set up your profile",
  'onb.pageSubtitle': "Just a few quick questions. I'll use them to curate content just for you.",
  'onb.progress': 'Question {n} of {total}',
  'onb.back': 'Back',
  'onb.next': 'Next',
  'onb.review': 'Review',
  'onb.add': 'Add',
  'onb.addAnother': 'Add another…',
  'onb.other': 'Other: describe',
  'onb.typeEnter': 'Type and press Enter',
  'onb.genLoading': '✨ Generating personalized suggestions for you…',
  'onb.combining': '✨ Combining your answers and finding suggestions for you… (may take ~15s)',
  'onb.noIdeas': 'Out of ideas? Here are some suggestions:',
  'onb.topicsErrorSuffix': 'You can still add topics manually.',

  'confirm.title': 'All set?',
  'confirm.titleNamed': 'All set, {nome}?',
  'confirm.subtitle': 'Check that everything looks right. You can edit it anytime later.',
  'confirm.name': 'Name',
  'confirm.theme': 'Theme(s)',
  'confirm.context': 'Context',
  'confirm.about': 'About you',
  'confirm.goal': 'Goal',
  'confirm.topics': 'Topics',
  'confirm.refs': 'References',
  'confirm.formats': 'Formats',
  'confirm.ignore': 'Ignore',
  'confirm.frequency': 'Frequency',
  'confirm.saving': 'Saving…',
  'confirm.confirm': 'Confirm and save',
  'confirm.backEdit': 'Back to edit',
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

  'onb.pageTitle': 'Vamos a armar tu perfil',
  'onb.pageSubtitle': 'Son unas preguntas rápidas. Las usaré para curar contenido solo para ti.',
  'onb.progress': 'Pregunta {n} de {total}',
  'onb.back': 'Volver',
  'onb.next': 'Siguiente',
  'onb.review': 'Revisar',
  'onb.add': 'Añadir',
  'onb.addAnother': 'Añadir otro…',
  'onb.other': 'Otro: describe',
  'onb.typeEnter': 'Escribe y pulsa Enter',
  'onb.genLoading': '✨ Generando sugerencias personalizadas para ti…',
  'onb.combining': '✨ Combinando tus respuestas y buscando sugerencias para ti… (puede tardar ~15s)',
  'onb.noIdeas': '¿Sin ideas? Aquí van algunas sugerencias:',
  'onb.topicsErrorSuffix': 'Todavía puedes añadir temas manualmente.',

  'confirm.title': '¿Todo bien?',
  'confirm.titleNamed': '¿Todo bien, {nome}?',
  'confirm.subtitle': 'Revisa que esté todo como quieres. Puedes editarlo cuando quieras.',
  'confirm.name': 'Nombre',
  'confirm.theme': 'Tema(s)',
  'confirm.context': 'Contexto',
  'confirm.about': 'Sobre ti',
  'confirm.goal': 'Objetivo',
  'confirm.topics': 'Temas',
  'confirm.refs': 'Referencias',
  'confirm.formats': 'Formatos',
  'confirm.ignore': 'Ignorar',
  'confirm.frequency': 'Frecuencia',
  'confirm.saving': 'Guardando…',
  'confirm.confirm': 'Confirmar y guardar',
  'confirm.backEdit': 'Volver a editar',
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
