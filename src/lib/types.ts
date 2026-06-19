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

export type Relevancia = 'Alta' | 'Média' | 'Baixa';

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
  /** Cadência-base em dias (diária=1, a cada 3 dias=3, semanal=7), SEM a folga.
   *  Usada pro cooldown do "Gerar agora" (= período entre curadorias). */
  baseDias: number;
  /** Janela efetiva em dias (cadência-base + folga de frescor). Alimenta tanto
   *  a busca (Tavily.days) quanto o corte de frescor. Cadência-base diária → 3,
   *  3-day → 6, semanal → 10 (base 1/3/7 + GRACE_DIAS). */
  janelaDias: number;
  /** Texto pro prompt descrevendo a janela. */
  rotulo: string;
  /** Hoje no formato YYYY-MM-DD. */
  todayISO: string;
  /** Data limite de FRESCOR em YYYY-MM-DD — preferência. Tudo antes disso só entra
   *  via reabsorção (degradação graciosa) se faltar conteúdo recente. Diário = ontem. */
  cutoffISO: string;
  /** Limite de REABSORÇÃO (= hoje − janelaDias). Em dia magro o pipeline reaproveita
   *  itens entre cutoffISO e este limite em vez de mandar email vazio. Pro diário é o
   *  reach-back de 2-4 dias; pras outras cadências é igual a cutoffISO. */
  cutoffGraceISO: string;
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
  let itemsMax = 10;

  if (slug === 'weekly') {
    baseDias = 7;
    itemsMin = 10;
    itemsMax = 15;
  } else if (slug === 'every3days') {
    baseDias = 3;
    itemsMin = 7;
    itemsMax = 15;
  }

  // `janelaDias` (busca Tavily.days + janela de dedup entre edições): base + folga.
  // A folga garante OFERTA de candidatos em dia de pouca notícia (busca larga).
  const GRACE_DIAS = 3;
  const janelaDias = baseDias + GRACE_DIAS;

  // Corte de FRESCOR (gate duro pós-seleção). O DIÁRIO é estrito: só ontem + hoje
  // (cutoff = ontem ⇒ ~32h de manhã, até ~48h à noite) pra o conteúdo ser sempre
  // recente. Quando faltar volume nesse recorte, o preenchimento-por-área
  // (relevância "Baixa", coerente com o tema) compensa — em vez de afrouxar a data.
  // Cadências espaçadas mantêm a folga: faz sentido conteúdo de alguns dias num
  // email a cada 3 dias / semanal.
  const cutoffDias = slug === 'daily' ? 1 : janelaDias;
  const cutoff = new Date(today.getTime() - cutoffDias * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().split('T')[0];

  // Limite de REABSORÇÃO (degradação graciosa). O cutoff estrito é a preferência;
  // se não houver itens recentes suficientes, o pipeline reaproveita conteúdo até
  // este limite mais largo (= base + folga) em vez de mandar um email vazio. Pro
  // diário, é o "reach-back" pros 2-4 dias anteriores; pras outras cadências é
  // igual ao cutoffISO (sem reabsorção extra).
  const cutoffGraceISO = new Date(today.getTime() - janelaDias * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const rotulo = slug === 'daily' ? 'ontem e hoje (~32h)' : `últimos ${cutoffDias} dias`;

  return {
    baseDias,
    janelaDias,
    rotulo,
    todayISO,
    cutoffISO,
    cutoffGraceISO,
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
