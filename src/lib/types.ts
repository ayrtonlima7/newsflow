export interface Profile {
  area: string;
  cargo: string;
  topicos: string[];
  /** Versão normalizada por LLM dos tópicos. Usada nos prompts em vez de `topicos`
   *  pra reduzir alucinação. Se vazio/undefined, prompts caem em `topicos`. */
  topicos_busca?: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
  tom: string;
  fontes_prioritarias: string[];
  descricoes_livres: Record<string, string>;
}

/** Converte o Profile (UI) na forma vista pelos prompts: substitui `topicos`
 *  pela versão normalizada (`topicos_busca`) quando disponível e remove o campo
 *  bruto, pra evitar confundir o modelo com duas listas. */
export function profileForPrompt(profile: Profile): Omit<Profile, 'topicos_busca'> {
  const hasNormalized =
    Array.isArray(profile.topicos_busca) && profile.topicos_busca.length > 0;
  return {
    area: profile.area,
    cargo: profile.cargo,
    topicos: hasNormalized ? (profile.topicos_busca as string[]) : profile.topicos,
    ignorar: profile.ignorar,
    frequencia: profile.frequencia,
    horario: profile.horario,
    tom: profile.tom,
    fontes_prioritarias: profile.fontes_prioritarias,
    descricoes_livres: profile.descricoes_livres,
  };
}

export type Relevancia = 'Alta' | 'Média';

export interface BriefingItem {
  titulo: string;
  fonte: string;
  url: string;
  relevancia: Relevancia;
  motivo_relevancia: string;
  resumo: string;
}

export interface Briefing {
  data_referencia: string;
  itens: BriefingItem[];
}

export interface EmailOutput {
  assunto: string;
  html: string;
}

export function frequenciaParaJanela(frequencia: string): { dias: number; rotulo: string } {
  const f = frequencia.toLowerCase();
  if (f.includes('semana')) return { dias: 7, rotulo: 'últimos 7 dias' };
  return { dias: 1, rotulo: 'últimas 24 horas' };
}
