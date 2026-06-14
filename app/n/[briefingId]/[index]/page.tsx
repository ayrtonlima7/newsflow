import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocale } from '@/app/_i18n/locale';
import { getDictionary, translate } from '@/src/lib/messages';
import { formatItemDate } from '@/src/lib/email-template';
import { Logo } from '@/app/_brand/logo';
import type { BriefingItem } from '@/src/lib/types';
import { ShareBar } from './share-bar';

// Página PÚBLICA (sem auth) de uma notícia compartilhada (issue #6). Lê o item
// do briefing por id+índice. Render por request (admin client bypassa RLS).
export const dynamic = 'force-dynamic';

async function getItem(briefingId: string, indexStr: string): Promise<BriefingItem | null> {
  const index = Number(indexStr);
  if (!Number.isInteger(index) || index < 0) return null;
  const sb = createAdminClient();
  const { data } = await sb
    .from('briefings')
    .select('itens')
    .eq('id', briefingId)
    .maybeSingle();
  const itens = (data?.itens as BriefingItem[] | undefined) ?? [];
  return itens[index] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ briefingId: string; index: string }>;
}): Promise<Metadata> {
  const { briefingId, index } = await params;
  const item = await getItem(briefingId, index);
  if (!item) return { title: 'NewsFlow' };
  const desc = (item.corpo ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return {
    title: `${item.titulo} · NewsFlow`,
    description: desc,
    openGraph: {
      title: item.titulo,
      description: desc,
      images: ['/og-default.png'],
      type: 'article',
      siteName: 'NewsFlow',
    },
    twitter: {
      card: 'summary_large_image',
      title: item.titulo,
      description: desc,
      images: ['/og-default.png'],
    },
  };
}

export default async function SharedItemPage({
  params,
}: {
  params: Promise<{ briefingId: string; index: string }>;
}) {
  const { briefingId, index } = await params;
  const item = await getItem(briefingId, index);
  if (!item) notFound();

  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = (k: string) => translate(dict, k);
  const data = formatItemDate(item.data_publicacao, locale);
  const paragraphs = (item.corpo ?? '').trim().split(/\n{2,}/);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="NewsFlow">
          <Logo size={30} />
        </Link>
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-accent)]">
          {t('share.eyebrow')}
        </span>
      </header>

      <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-sm">
        <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">
          {item.titulo}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.04em] text-[var(--color-muted)]">
          {data ? `${item.fonte} · ${data}` : item.fonte}
        </p>

        <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-[var(--color-fg)]">
          {paragraphs.map((p, i) => (
            <p key={i}>
              {p.split('\n').map((line, j) => (
                <span key={j}>
                  {line}
                  {j < p.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block text-sm font-semibold text-[var(--color-accent)] hover:underline"
        >
          {t('share.readOriginal')}
        </a>

        <ShareBar title={item.titulo} shareLabel={t('share.shareThis')} copyLabel={t('share.copyLink')} copiedLabel={t('share.copied')} />
      </article>

      {/* CTA de aquisição */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-center shadow-sm">
        <p className="text-lg font-bold tracking-tight">{t('share.ctaTitle')}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
          {t('share.ctaSubtitle')}
        </p>
        <Link
          href="/?utm_source=share&utm_medium=referral"
          className="mt-5 inline-block rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:opacity-90"
        >
          {t('share.ctaButton')}
        </Link>
      </div>
    </main>
  );
}
