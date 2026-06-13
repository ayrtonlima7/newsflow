'use client';

/**
 * Liga a sessão anônima ao usuário autenticado (PostHog identify). É o pino que
 * mantém o funil inteiro — landing (anônimo) → onboarding → checkout — atrelado
 * à MESMA pessoa. Sem isso, o PostHog corta o funil no login.
 *
 * Montado nas páginas autenticadas (onboarding, settings) passando `userId` do
 * server component. Roda uma vez por montagem; no-op sem analytics configurado.
 */

import { useEffect } from 'react';
import { identifyUser } from '@/src/lib/analytics/track';

export function IdentifyUser({
  userId,
  email,
}: {
  userId: string;
  email?: string;
}) {
  useEffect(() => {
    identifyUser(userId, email ? { email } : undefined);
  }, [userId, email]);

  return null;
}
