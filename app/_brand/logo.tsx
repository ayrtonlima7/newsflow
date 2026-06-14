/**
 * Marca do NewsFlow em SVG inline (nítido em qualquer tamanho, theme-aware).
 *
 * - LogoIcon: o "N" branco no quadrado com gradiente indigo. É AGNÓSTICO ao tema
 *   (sempre indigo+branco) — igual ao header do email e ao app icon.
 * - Logo: ícone + wordmark "NewsFlow". O wordmark usa `currentColor`, então
 *   herda a cor do texto (var(--color-fg)) e acompanha claro/escuro.
 */

export function LogoIcon({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="nf-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#312E81" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#nf-logo-grad)" />
      <path
        d="M 18 49 L 18 15 L 36 34 L 36 15 L 46 15 L 46 49 L 28 34 L 28 49 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function Logo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <LogoIcon size={size} />
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: size * 0.62, color: 'var(--color-fg)' }}
      >
        NewsFlow
      </span>
    </span>
  );
}
