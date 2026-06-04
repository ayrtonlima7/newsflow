/** IDs das perguntas — também são as chaves no objeto de respostas. */
export type QuestionId =
  | 'nome'
  | 'tema'
  | 'contexto'
  | 'descricao_livre'
  | 'objetivo'
  | 'topicos'
  | 'referencias'
  | 'formatos'
  | 'ignorar'
  | 'frequencia';

type BaseQuestion = {
  id: QuestionId;
  question: string;
  helper?: string;
  chips: string[];
  allowFree: boolean;
  /** Renderiza textarea em vez de input. Pra texto longo (descricao_livre). */
  multiline?: boolean;
  /** Variação B: input de texto livre é o protagonista, chips aparecem abaixo como sugestões. */
  inputFirst?: boolean;
  placeholder?: string;
  /** Pergunta só aparece se `answers[dependsOn]` ∈ `values`. */
  condicional?: { dependsOn: QuestionId; values: string[] };
  required: boolean;
};

export type SingleQuestion = BaseQuestion & { type: 'single' };
export type MultiQuestion = BaseQuestion & {
  type: 'multi';
  /** Se true, os chips são gerados por LLM no momento certo (rodando antes de mostrar a pergunta). */
  dynamic?: boolean;
  minSelections?: number;
};

export type Question = SingleQuestion | MultiQuestion;

export const questions: Question[] = [
  {
    id: 'nome',
    type: 'single',
    question: 'Antes de tudo — como você quer ser chamado?',
    helper: 'Vou usar nos seus emails. Pode ser primeiro nome, apelido, o que combinar.',
    chips: [],
    allowFree: true,
    placeholder: 'Ex: Ayrton, Lu, Dr. Carlos...',
    required: true,
  },
  {
    id: 'tema',
    type: 'multi',
    question: 'Sobre o quê você quer receber conteúdo?',
    helper: 'Pode ser sua profissão, um hobby, ou algo que te interessa. Escolha um ou mais.',
    chips: [
      'Tecnologia',
      'Saúde',
      'Negócios e finanças',
      'Educação',
      'Design',
      'Comunicação',
      'Esportes',
      'Cultura e entretenimento',
      'Política e atualidades',
      'Ciência',
      'Estilo de vida',
    ],
    allowFree: true,
    minSelections: 1,
    required: true,
  },
  {
    id: 'contexto',
    type: 'single',
    question: 'Como esse tema entra na sua vida?',
    helper: 'Isso me ajuda a calibrar a profundidade do conteúdo.',
    chips: ['Profissão', 'Estudo', 'Hobby ou paixão', 'Curiosidade geral'],
    allowFree: false,
    required: true,
  },
  {
    id: 'descricao_livre',
    type: 'single',
    question: 'Conta um pouco mais sobre você nesse tema',
    helper:
      'Quanto mais específico, melhor a IA personaliza. Ex: "Arquiteta junior em escritório residencial em SP", "Estudante de medicina veterinária no 3º ano", "Aprendendo a programar do zero, focado em Python".',
    chips: [],
    allowFree: true,
    multiline: true,
    placeholder: 'Conta seu momento atual...',
    condicional: { dependsOn: 'contexto', values: ['Profissão', 'Estudo'] },
    required: false,
  },
  {
    id: 'objetivo',
    type: 'single',
    question: 'O que você quer ganhar lendo esses emails?',
    helper: 'Isso muda o tipo de conteúdo que vou priorizar.',
    chips: [
      'Ficar de olho no que tá rolando',
      'Aprender coisas novas',
      'Decisões pro meu dia a dia',
      'Inspiração e tendências',
      'Cultura geral / saber sobre',
    ],
    allowFree: true,
    required: true,
  },
  {
    id: 'referencias',
    type: 'multi',
    question: 'Quem você admira ou já acompanha nesse tema?',
    helper:
      'Pessoas, marcas, podcasts, sites, perfis... Opcional, mas vou priorizar conteúdo dessas fontes quando aparecerem.',
    chips: [],
    allowFree: true,
    inputFirst: true,
    placeholder: 'Ex: Lex Fridman, Atrium Studio, Hacker News, Anthropic, Cazé TV...',
    required: false,
  },
  {
    id: 'formatos',
    type: 'multi',
    question: 'Que formatos você mais gosta de consumir?',
    helper: 'Vou priorizar esses no que te trago.',
    chips: [
      'Artigos longos',
      'Notícias rápidas',
      'Posts de redes / threads',
      'Vídeos / podcasts',
      'Estudos / papers',
    ],
    allowFree: false,
    minSelections: 1,
    required: true,
  },
  {
    id: 'ignorar',
    type: 'multi',
    question: 'O que você NÃO quer receber?',
    helper:
      'Padrões irritantes ou temas específicos. Quanto mais claro, mais limpo fica o email.',
    chips: [
      'Conteúdo muito básico',
      'Notícias internacionais',
      'Tutoriais passo a passo',
      'Opinião e polêmica',
    ],
    allowFree: true,
    required: false,
  },
  {
    id: 'topicos',
    type: 'multi',
    question: 'Pra fechar — que tópicos, ferramentas, marcas ou conceitos estão no seu radar agora?',
    helper:
      'Quanto mais específico, melhor. Digite o que vem na cabeça e dá enter. Tem sugestões personalizadas abaixo, baseadas em tudo que você contou até aqui.',
    chips: [],
    dynamic: true,
    allowFree: true,
    inputFirst: true,
    minSelections: 1,
    placeholder: 'Ex: IA generativa, maratona de 21k, restauração de móveis, bolsa americana...',
    required: true,
  },
  {
    id: 'frequencia',
    type: 'single',
    question: 'Com que frequência quer receber?',
    helper: 'Pode mudar depois nas configurações.',
    chips: ['Uma vez por semana', 'Todo dia de manhã'],
    allowFree: false,
    required: true,
  },
];

/** Avalia se uma pergunta condicional deve ser mostrada com base nas respostas atuais. */
export function isQuestionShown(
  q: Question,
  answers: Record<QuestionId, string | string[]>,
): boolean {
  if (!q.condicional) return true;
  const val = answers[q.condicional.dependsOn];
  if (Array.isArray(val)) return val.some((v) => q.condicional!.values.includes(v));
  return typeof val === 'string' && q.condicional.values.includes(val);
}
