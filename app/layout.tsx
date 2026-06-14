import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from './_i18n/locale';
import { getDictionary } from '@/src/lib/messages';
import { HTML_LANG } from '@/src/lib/i18n';
import { I18nProvider } from './_i18n/provider';
import { LanguageSwitcher } from './_i18n/language-switcher';
import { AnalyticsProvider } from './_analytics/analytics-provider';
import { ThemeToggle } from './_brand/theme-toggle';

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

  return (
    <html lang={HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <AnalyticsProvider />
        <I18nProvider locale={locale} dict={dict}>
          {/* Controles globais (tema + idioma) — presentes em toda página. */}
          <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
