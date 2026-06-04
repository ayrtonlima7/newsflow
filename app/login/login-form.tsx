'use client';

import { useActionState } from 'react';
import { requestMagicLink, type LoginState } from './actions';

const initial: LoginState = { status: 'idle' };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initial);

  if (state.status === 'sent') {
    // Modo dev: link direto, sem precisar abrir email
    if (state.devLink) {
      return (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-700">
              ⚙️ Modo dev — bypass de email
            </p>
            <h2 className="text-lg font-medium text-stone-900">Link mágico gerado</h2>
            <p className="text-sm text-stone-700">
              Pra <span className="font-medium">{state.email}</span>. Em produção, esse link
              viria por email. Aqui em local, clica abaixo pra entrar:
            </p>
          </div>
          <a
            href={state.devLink}
            className="block w-full rounded-md bg-[var(--color-fg)] px-6 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
          >
            Entrar agora →
          </a>
          <details className="text-xs text-stone-600">
            <summary className="cursor-pointer">Ver URL completa</summary>
            <code className="mt-2 block break-all rounded bg-stone-100 p-2 text-[10px]">
              {state.devLink}
            </code>
          </details>
        </div>
      );
    }

    // Modo prod: mensagem padrão de "verifique seu email"
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-6 space-y-3">
        <p className="text-2xl">📬</p>
        <h2 className="text-lg font-medium">Link mágico a caminho</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Mandamos um link para{' '}
          <span className="font-medium text-[var(--color-fg)]">{state.email}</span>. Clica
          nele para entrar — pode levar até 1 minuto para chegar.
        </p>
        <p className="text-xs text-[var(--color-muted)]">
          Não chegou? Veja a pasta de spam. Ou tente de novo com outro email.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? '/onboarding'} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          placeholder="voce@email.com"
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
        />
      </div>
      {state.status === 'error' && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Enviar link mágico'}
      </button>
    </form>
  );
}
