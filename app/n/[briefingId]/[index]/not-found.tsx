import Link from 'next/link';
import { Logo } from '@/app/_brand/logo';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Link href="/" aria-label="NewsFlow">
        <Logo size={32} />
      </Link>
      <p className="text-lg font-semibold">Notícia não encontrada</p>
      <p className="text-sm text-[var(--color-muted)]">
        Esse link pode ter expirado ou estar incorreto.
      </p>
      <Link
        href="/"
        className="rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:opacity-90"
      >
        Conhecer o NewsFlow
      </Link>
    </main>
  );
}
