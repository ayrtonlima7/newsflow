export interface Profile {
  /** Como o usuário quer ser chamado nos emails. */
  nome: string;

  /** Temas amplos de interesse (multi). Pode ser profissão, hobby, curiosidade. */
  tema: string[];

  /** Contexto da relação com o(s) tema(s): Profissão / Estudo / Hobby ou paixão / Curiosidade geral. */
  contexto: string;

  /** Descrição livre opcional sobre o momento do usuário no tema (só faz sentido se contexto = Profissão ou Estudo). */
  descricao_livre: string;

  /** Intent — o que o usuário quer ganhar lendo os emails. */
  objetivo: string;

  /** Tags específicas que estão no radar do usuário (entidades, ferramentas, conceitos). */
  topicos: string[];

  /** Versão normalizada por LLM dos tópicos, usada nos prompts pra reduzir alucinação. */
  topicos_busca?: string[];

  /** Pessoas, marcas, podcasts, canais que o usuário admira. Vai como sinal de qualidade pro curate. */
  referencias: string[];

  /** Formatos de conteúdo preferidos (artigos longos, posts curtos, podcasts...). */
  formatos: string[];

  /** Padrões e tópicos a ignorar/filtrar. */
  ignorar: string[];

  /** Cadência de envio (Uma vez por semana / Todo dia de manhã). */
  frequencia: string;

  /** Horário fixo em 8h hoje (Vercel Hobby roda cron 1×/dia). Reativável no Pro. */
  horario: string;
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

/**
 * Versão do Profile vista pelos prompts da IA. Substitui `topicos` pela versão
 * normalizada (`topicos_busca`) quando disponível e remove campos internos.
 */
export function profileForPrompt(profile: Profile): {
  nome: string;
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string;
  topicos: string[];
  referencias: string[];
  formatos: string[];
  ignorar: string[];
  frequencia: string;
} {
  const hasNormalized =
    Array.isArray(profile.topicos_busca) && profile.topicos_busca.length > 0;
  const topicos = hasNormalized ? (profile.topicos_busca as string[]) : profile.topicos;

  return {
    nome: profile.nome ?? '',
    tema: profile.tema ?? [],
    contexto: profile.contexto ?? '',
    descricao_livre: profile.descricao_livre ?? '',
    objetivo: profile.objetivo ?? '',
    topicos,
    referencias: profile.referencias ?? [],
    formatos: profile.formatos ?? [],
    ignorar: profile.ignorar ?? [],
    frequencia: profile.frequencia ?? '',
  };
}
