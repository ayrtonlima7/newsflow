import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from './_i18n/locale';
import { getDictionary } from '@/src/lib/messages';
import { HTML_LANG } from '@/src/lib/i18n';
import { I18nProvider } from './_i18n/provider';
import { LanguageSwitcher } from './_i18n/language-switcher';
import { AnalyticsProvider } from './_analytics/analytics-provider';
import { ThemeToggle } from './_brand/theme-toggle';
import { SignOutButton } from './_brand/sign-out-button';
import { cookies } from 'next/headers';

// Script anti-flash (FOUC): roda ANTES do paint, lê o tema salvo e aplica no
// <html>. Default LIGHT — só vira dark se o usuário escolheu (localStorage).
// NÃO usa prefers-color-scheme (manteria "claro por padrão" mesmo em OS dark).
const THEME_INIT = `(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=p||localStorage.getItem('nf-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'NewsFlow AI — seu jornal customizado',
  description:
    'Curadoria diária por IA das notícias que importam para você. Como um amigo atento que leu tudo e te conta o que vale.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  // Só mostra "Sair" quando há cookie de sessão. Checagem LOCAL de cookie, de
  // propósito: `auth.getUser()` faria uma chamada de REDE ao Supabase em TODA
  // página (o layout raiz envolve tudo, inclusive a landing e as páginas
  // públicas /n/...), somando latência e um ponto de falha global — caro demais
  // pra decidir a exibição de um botão. Não é fronteira de segurança: toda
  // autorização de verdade (middleware, /settings, /onboarding, server actions)
  // continua usando getUser(). Pior caso de um cookie vencido é mostrar "Sair"
  // pra quem já expirou — e clicar apenas limpa a sessão e volta pra home.
  const cookieStore = await cookies();
  const isAuthed = cookieStore.getAll().some((c) => c.name.includes('-auth-token'));

  return (
    <html lang={HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <AnalyticsProvider />
        <I18nProvider locale={locale} dict={dict}>
          {/* Controles globais (tema + idioma + sair) — presentes em toda página.
              O "Sair" só aparece logado, e é o que garante saída de QUALQUER
              página autenticada (inclusive /onboarding, que antes prendia). */}
          <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            {isAuthed && <SignOutButton />}
          </div>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
