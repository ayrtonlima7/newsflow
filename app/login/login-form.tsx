'use client';

import { useActionState } from 'react';
import { requestMagicLink, type LoginState } from './actions';

const initial: LoginState = { status: 'idle' };
const IS_DEV = process.env.NODE_ENV === 'development';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initial);

  // Em prod: depois do submit, mostra "Link mágico a caminho"
  // Em dev: nunca chega aqui (redirect direto pro next)
  if (state.status === 'sent') {
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

      {IS_DEV && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚙️ <strong>Modo dev:</strong> ao clicar abaixo, você será logado direto, sem
          precisar abrir email.
        </div>
      )}

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
        {pending ? (IS_DEV ? 'Entrando…' : 'Enviando…') : IS_DEV ? 'Entrar (dev)' : 'Enviar link mágico'}
      </button>
    </form>
  );
}
