import { redirect } from 'next/navigation';

/**
 * A tela de login foi unificada na home (/). Esta rota agora só redireciona pra
 * lá, preservando next/error — mantém links antigos, bookmarks e o fluxo de auth
 * funcionando sem 404.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const qs = new URLSearchParams();
  if (next) qs.set('next', next);
  if (error) qs.set('error', error);
  const q = qs.toString();
  redirect(q ? `/?${q}` : '/');
}
