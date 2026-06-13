import type { Metadata } from 'next';
import './globals.css';
import { getLocale } from './_i18n/locale';
import { getDictionary } from '@/src/lib/messages';
import { HTML_LANG } from '@/src/lib/i18n';
import { I18nProvider } from './_i18n/provider';
import { LanguageSwitcher } from './_i18n/language-switcher';
import { AnalyticsProvider } from './_analytics/analytics-provider';

export const metadata: Metadata = {
  title: 'NewsFlow AI — seu jornal customizado',
  description:
    'Curadoria diária por IA das notícias que importam para você. Como um amigo atento que leu tudo e te conta o que vale.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <html lang={HTML_LANG[locale]}>
      <body>
        <AnalyticsProvider />
        <I18nProvider locale={locale} dict={dict}>
          {/* Seletor global — presente em toda página, do início ao fim do fluxo. */}
          <div className="fixed right-3 top-3 z-50">
            <LanguageSwitcher />
          </div>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
