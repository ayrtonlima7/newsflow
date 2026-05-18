import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <a href="/" className="text-sm text-[var(--color-muted)] hover:underline">
          ← voltar
        </a>
        <h1 className="text-3xl font-semibold tracking-tight">Entrar no NewsFlow</h1>
        <p className="text-[var(--color-muted)]">
          A gente te manda um link mágico. Sem senha, sem complicação.
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Não foi possível confirmar o link.</p>
          <p className="text-red-600/80">{error}</p>
        </div>
      )}
      <LoginForm next={next} />
    </main>
  );
}
