'use client';

/**
 * Botão de alternância claro/escuro. Grava a escolha em localStorage e seta
 * [data-theme] no <html>. O default é LIGHT — o tema só fica dark se o usuário
 * tiver escolhido (o script anti-flash no layout lê esse mesmo localStorage
 * antes do paint, evitando piscada).
 */

import { useEffect, useState } from 'react';
import { useT } from '../_i18n/provider';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>('light');

  // Sincroniza o estado do botão com o que o script anti-flash já aplicou no DOM.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('nf-theme', next);
    } catch {
      /* ignora (modo privado, etc.) */
    }
  }

  const isDark = theme === 'dark';
  const label = isDark ? t('theme.toLight') : t('theme.toDark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
    >
      {isDark ? (
        // Sol (está escuro → clicar volta pro claro)
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Lua (está claro → clicar vai pro escuro)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
