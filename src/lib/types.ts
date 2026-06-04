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

export type UrlStatus = 'verified' | 'fallback' | 'source-only';

export interface BriefingItem {
  titulo: string;
  fonte: string;
  /** URL final usada — pode ser a original (verified), parent (fallback) ou origem (source-only). */
  url: string;
  /** Status de verificação. Email gen usa pra decidir como renderizar o link. */
  urlStatus?: UrlStatus;
  /** Quando urlStatus !== 'verified', guarda a URL original que o modelo gerou (pra debug/log). */
  urlOriginal?: string;
  /** Data de publicação do conteúdo no formato YYYY-MM-DD. Obrigatório pro filtro de frescor. */
  data_publicacao: string;
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

export interface JanelaFrescor {
  /** Janela em dias. Conteúdo mais antigo que isso é REJEITADO. Casa exatamente
   *  com a cadência de entrega: diária → 1, semanal → 7. */
  janelaDias: number;
  /** Texto pro prompt descrevendo a janela. */
  rotulo: string;
  /** Hoje no formato YYYY-MM-DD. */
  todayISO: string;
  /** Data limite em YYYY-MM-DD — tudo publicado antes disso é rejeitado. */
  cutoffISO: string;
}

export function frequenciaParaJanela(frequencia: string): JanelaFrescor {
  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];

  const f = frequencia.toLowerCase();
  // Janela = cadência de entrega. Se o usuário recebe semanal, o gap útil é 7 dias.
  // Se recebe diário, é 1 dia. Sem padding com conteúdo velho.
  const janelaDias = f.includes('semana') ? 7 : 1;

  const cutoff = new Date(today.getTime() - janelaDias * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().split('T')[0];

  return {
    janelaDias,
    rotulo: janelaDias === 1 ? 'últimas 24 horas' : `últimos ${janelaDias} dias`,
    todayISO,
    cutoffISO,
  };
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
