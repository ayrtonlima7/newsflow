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

  /** Email pra onde a curadoria é enviada. Se vazio/ausente, usa o email da conta
   *  (auth). NÃO vai pro prompt da IA — é só destino de entrega. */
  delivery_email?: string;
}

export type Relevancia = 'Alta' | 'Média';

export type UrlStatus = 'verified' | 'fallback' | 'source-only';

export interface BriefingItem {
  titulo: string;
  fonte: string;
  /** URL real (vinda da Tavily). */
  url: string;
  /** Status de verificação. Sempre 'verified' no fluxo atual (validação leniente). */
  urlStatus?: UrlStatus;
  urlOriginal?: string;
  /** Data de publicação do conteúdo no formato YYYY-MM-DD. */
  data_publicacao: string;
  relevancia: Relevancia;
  /** Corpo já na voz final ("amigo investido"), 6-10 linhas, com a relevância
   *  pro usuário embutida no texto. É isso que vai pro HTML do email. */
  corpo: string;
}

export interface Briefing {
  data_referencia: string;
  /** Assunto do email (gerado junto com a curadoria). */
  assunto?: string;
  /** Linha de abertura do email (saudação + contexto do dia). */
  intro?: string;
  itens: BriefingItem[];
}

export interface EmailOutput {
  assunto: string;
  html: string;
}

export interface JanelaFrescor {
  /** Janela em dias. Conteúdo mais antigo que isso é REJEITADO. Casa exatamente
   *  com a cadência de entrega: diária → 1, 3-day → 3, semanal → 7. */
  janelaDias: number;
  /** Texto pro prompt descrevendo a janela. */
  rotulo: string;
  /** Hoje no formato YYYY-MM-DD. */
  todayISO: string;
  /** Data limite em YYYY-MM-DD — tudo publicado antes disso é rejeitado. */
  cutoffISO: string;
  /** Mínimo de itens pedido ao modelo. Inclui buffer pra validação derrubar alguns. */
  itemsMin: number;
  /** Máximo de itens pedido ao modelo. */
  itemsMax: number;
}

export function frequenciaParaJanela(frequencia: string): JanelaFrescor {
  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];

  const f = frequencia.toLowerCase();

  // Janela em dias + quantidade alvo de itens.
  // Quantidades incluem buffer pra validação dropar alguns; usuário recebe ~60-80%.
  let janelaDias = 1;
  let itemsMin = 5;
  let itemsMax = 8;

  if (f.includes('semana')) {
    janelaDias = 7;
    itemsMin = 10;
    itemsMax = 15;
  } else if (
    f.includes('3 dias') ||
    f.includes('três dias') ||
    f.includes('tres dias')
  ) {
    janelaDias = 3;
    itemsMin = 7;
    itemsMax = 10;
  }

  const cutoff = new Date(today.getTime() - janelaDias * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().split('T')[0];

  let rotulo: string;
  if (janelaDias === 1) rotulo = 'últimas 24 horas';
  else rotulo = `últimos ${janelaDias} dias`;

  return {
    janelaDias,
    rotulo,
    todayISO,
    cutoffISO,
    itemsMin,
    itemsMax,
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
