export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-muted)]">
          NewsFlow AI
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Seu jornal customizado, escrito como um amigo te contaria.
        </h1>
        <p className="text-lg leading-relaxed text-[var(--color-muted)]">
          Curadoria diária por IA das notícias que importam pra você — sem o ruído de redes
          sociais, sem manchetes infladas. Direto no seu email, no horário que você escolher.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href="/onboarding"
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90"
        >
          Criar meu perfil de curadoria
        </a>
        <a
          href="/login"
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-6 py-3 text-sm font-medium transition hover:bg-white"
        >
          Já sou assinante
        </a>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Fase 3 em construção — onboarding, auth e cron de entrega vêm a seguir.
      </p>
    </main>
  );
}
