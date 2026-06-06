'use client';

import { useActionState, useState } from 'react';
import { requestMagicLink, signInWithGoogle, type LoginState } from './actions';

const initial: LoginState = { status: 'idle' };
const IS_DEV = process.env.NODE_ENV === 'development';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initial);
  const [showEmail, setShowEmail] = useState(IS_DEV);

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
    <div className="space-y-4">
      {/* Opção principal: Google */}
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next ?? '/onboarding'} />
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border)] bg-white px-6 py-3 text-sm font-medium text-[var(--color-fg)] transition hover:bg-stone-50"
        >
          <GoogleIcon />
          Continuar com Google
        </button>
      </form>

      {state.status === 'error' && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      {/* Separador + alternativa por email */}
      {!showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="mx-auto block text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)]"
        >
          Prefere entrar com email?
        </button>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs text-[var(--color-muted)]">ou com email</span>
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          {IS_DEV && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚙️ <strong>Modo dev:</strong> ao clicar abaixo, você será logado direto, sem
              precisar abrir email.
            </div>
          )}

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
                placeholder="voce@email.com"
                className="w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--color-fg)]"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-accent-fg)] transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? (IS_DEV ? 'Entrando…' : 'Enviando…') : IS_DEV ? 'Entrar (dev)' : 'Enviar link mágico'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
