import type { Locale } from './i18n';
import { contextoLabel, normalizeFrequencia } from './onboarding-options';

export interface Profile {
  /** Como o usuário quer ser chamado nos emails. */
  nome: string;

  /** Temas amplos de interesse (multi). Pode ser profissão, hobby, curiosidade. */
  tema: string[];

  /** Contexto(s) da relação com o(s) tema(s): Profissão / Estudo / Hobby / Curiosidade.
   *  Múltipla escolha — guarda slugs (ver onboarding-options). */
  contexto: string[];

  /** Descrição livre opcional sobre o momento do usuário no tema (só faz sentido se contexto = Profissão ou Estudo). */
  descricao_livre: string;

  /** Intent(s) — o que o usuário quer ganhar lendo os emails. Múltipla escolha. */
  objetivo: string[];

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

  /** Horário escolhido pelo usuário (hora cheia, ex: "21:00"). Respeitado no
   *  onboarding e usado pelo cron (isDue, tolerância ±1h). Fallback "8h". */
  horario: string;

  /** Email pra onde a curadoria é enviada. Se vazio/ausente, usa o email da conta
   *  (auth). NÃO vai pro prompt da IA — é só destino de entrega. */
  delivery_email?: string;

  /** Idioma do usuário: 'pt' | 'en' | 'es' (default 'pt'). Define a língua da
   *  curadoria e do email. Normalizado via normalizeLocale() no uso. */
  idioma?: string;

  /** Domínios brasileiros mais relevantes pro perfil (derivados por LLM no save).
   *  Só preenchido pra usuários pt. Se undefined/null, o pipeline usa a lista
   *  estática DOMAINS_BY_LOCALE['pt']. */
  dominios_busca?: string[];
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
  /** Janela efetiva em dias (cadência-base + folga de frescor). Alimenta tanto
   *  a busca (Tavily.days) quanto o corte de frescor. Cadência-base diária → 3,
   *  3-day → 6, semanal → 10 (base 1/3/7 + GRACE_DIAS). */
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

  // Normaliza pra slug (tolera slug novo, rótulo PT legado e palavras-chave EN/ES).
  const slug = normalizeFrequencia(frequencia);

  // Janela-base da cadência + quantidade alvo de itens.
  // Quantidades incluem buffer pra validação dropar alguns; usuário recebe ~60-80%.
  let baseDias = 1;
  let itemsMin = 5;
  let itemsMax = 8;

  if (slug === 'weekly') {
    baseDias = 7;
    itemsMin = 10;
    itemsMax = 15;
  } else if (slug === 'every3days') {
    baseDias = 3;
    itemsMin = 7;
    itemsMax = 10;
  }

  // Folga sobre a janela-base. O backstop de frescor existe pra cortar conteúdo
  // MUITO antigo (semanas/anos) — não pra aparar notícia de 2-3 dias. Sem a folga,
  // a janela diária (24h) somada ao slop de fuso do published_date da Tavily
  // derrubava a maioria dos itens frescos e o briefing vinha quase vazio. A folga
  // também alimenta a busca (Tavily.days) pra garantir oferta em dias de pouca notícia.
  const GRACE_DIAS = 3;
  const janelaDias = baseDias + GRACE_DIAS;

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
export function profileForPrompt(
  profile: Profile,
  locale: Locale = 'pt',
): {
  nome: string;
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string[];
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
    // contexto são slugs ('profession'...) → manda os rótulos legíveis no idioma
    // pra casar com a calibração da persona ("Profissão = técnico", etc.).
    contexto: (profile.contexto ?? [])
      .map((c) => contextoLabel(c, locale))
      .filter(Boolean)
      .join(', '),
    descricao_livre: profile.descricao_livre ?? '',
    objetivo: profile.objetivo ?? [],
    topicos,
    referencias: profile.referencias ?? [],
    formatos: profile.formatos ?? [],
    ignorar: profile.ignorar ?? [],
    frequencia: profile.frequencia ?? '',
  };
}
