export interface Profile {
  area: string;
  cargo: string;
  topicos: string[];
  ignorar: string[];
  frequencia: string;
  horario: string;
  tom: string;
  fontes_prioritarias: string[];
  descricoes_livres: Record<string, string>;
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
