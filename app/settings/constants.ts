/** Helpers compartilhados entre actions e UI da rota /settings. */

/**
 * Formata um intervalo de cooldown (ms) de forma amigável: "2d 5h", "5h 10m",
 * "10m". Usado no "Gerar agora", cujo cooldown agora segue a frequência do
 * perfil (pode ser dias), não mais 5 min fixos.
 */
export function formatCooldown(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${min}m`;
  return `${min}m`;
}
