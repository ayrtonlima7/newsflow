import type { Locale } from '@/src/lib/i18n';
import {
  contextoOptions,
  frequenciaOptions,
  normalizeContexto,
} from '@/src/lib/onboarding-options';

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
  | 'frequencia'
  | 'horario';

type BaseQuestion = {
  id: QuestionId;
  question: string;
  helper?: string;
  chips: string[];
  /** Rótulo exibido por valor de chip (quando valor ≠ rótulo, ex: contexto/frequencia slugs). */
  optionLabels?: Record<string, string>;
  allowFree: boolean;
  multiline?: boolean;
  inputFirst?: boolean;
  placeholder?: string;
  condicional?: { dependsOn: QuestionId; values: string[] };
  required: boolean;
};

export type SingleQuestion = BaseQuestion & { type: 'single' };
export type MultiQuestion = BaseQuestion & {
  type: 'multi';
  dynamic?: boolean;
  minSelections?: number;
};

export type Question = SingleQuestion | MultiQuestion;

type Tri = Record<Locale, string>;
type TriArr = Record<Locale, string[]>;

/** Textos das perguntas (question/helper/placeholder) e chips livres, por idioma. */
const TXT: Record<string, { q: Tri; helper?: Tri; placeholder?: Tri; chips?: TriArr }> = {
  nome: {
    q: {
      pt: 'Antes de tudo — como você quer ser chamado?',
      en: 'First things first — what should we call you?',
      es: 'Antes que nada — ¿cómo quieres que te llamemos?',
    },
    helper: {
      pt: 'Vou usar nos seus emails. Pode ser primeiro nome, apelido, o que combinar.',
      en: "I'll use it in your emails. First name, nickname, whatever fits.",
      es: 'Lo usaré en tus emails. Nombre, apodo, lo que prefieras.',
    },
    placeholder: {
      pt: 'Ex: Ayrton, Lu, Dr. Carlos...',
      en: 'E.g. Ayrton, Lu, Dr. Carlos...',
      es: 'Ej: Ayrton, Lu, Dr. Carlos...',
    },
  },
  tema: {
    q: {
      pt: 'Sobre o quê você quer receber conteúdo?',
      en: 'What do you want to get content about?',
      es: '¿Sobre qué quieres recibir contenido?',
    },
    helper: {
      pt: 'Pode ser sua profissão, um hobby, ou algo que te interessa. Escolha um ou mais.',
      en: 'Your profession, a hobby, or anything you care about. Pick one or more.',
      es: 'Tu profesión, un hobby, o algo que te interese. Elige uno o más.',
    },
    chips: {
      pt: ['Tecnologia', 'Saúde', 'Negócios e finanças', 'Educação', 'Design', 'Comunicação', 'Esportes', 'Cultura e entretenimento', 'Política e atualidades', 'Ciência', 'Estilo de vida'],
      en: ['Technology', 'Health', 'Business & finance', 'Education', 'Design', 'Communication', 'Sports', 'Culture & entertainment', 'Politics & current affairs', 'Science', 'Lifestyle'],
      es: ['Tecnología', 'Salud', 'Negocios y finanzas', 'Educación', 'Diseño', 'Comunicación', 'Deportes', 'Cultura y entretenimiento', 'Política y actualidad', 'Ciencia', 'Estilo de vida'],
    },
  },
  contexto: {
    q: {
      pt: 'Como esse tema entra na sua vida?',
      en: 'How does this theme fit into your life?',
      es: '¿Cómo entra este tema en tu vida?',
    },
    helper: {
      pt: 'Isso me ajuda a calibrar a profundidade do conteúdo.',
      en: 'This helps me calibrate how deep the content goes.',
      es: 'Esto me ayuda a calibrar la profundidad del contenido.',
    },
  },
  descricao_livre: {
    q: {
      pt: 'Conta um pouco mais sobre você nesse tema',
      en: 'Tell me a bit more about you in this area',
      es: 'Cuéntame un poco más sobre ti en este tema',
    },
    helper: {
      pt: 'Quanto mais específico, melhor a IA personaliza. Ex: "Arquiteta junior em escritório residencial em SP", "Estudante de medicina veterinária no 3º ano".',
      en: 'The more specific, the better the AI personalizes. E.g. "Junior architect at a residential firm", "3rd-year veterinary student".',
      es: 'Cuanto más específico, mejor personaliza la IA. Ej: "Arquitecta junior en estudio residencial", "Estudiante de veterinaria de 3er año".',
    },
    placeholder: {
      pt: 'Conta seu momento atual...',
      en: 'Describe where you are right now...',
      es: 'Cuenta tu momento actual...',
    },
  },
  objetivo: {
    q: {
      pt: 'O que você quer ganhar lendo esses emails?',
      en: 'What do you want to get out of these emails?',
      es: '¿Qué quieres conseguir leyendo estos emails?',
    },
    helper: {
      pt: 'Isso muda o tipo de conteúdo que vou priorizar.',
      en: 'This changes the kind of content I prioritize.',
      es: 'Esto cambia el tipo de contenido que voy a priorizar.',
    },
    chips: {
      pt: ['Ficar de olho no que tá rolando', 'Aprender coisas novas', 'Decisões pro meu dia a dia', 'Inspiração e tendências', 'Cultura geral / saber sobre'],
      en: ["Keep an eye on what's happening", 'Learn new things', 'Decisions for my day-to-day', 'Inspiration & trends', 'General knowledge / good to know'],
      es: ['Estar al tanto de lo que pasa', 'Aprender cosas nuevas', 'Decisiones para mi día a día', 'Inspiración y tendencias', 'Cultura general / saber del tema'],
    },
  },
  referencias: {
    q: {
      pt: 'Quem você admira ou já acompanha nesse tema?',
      en: 'Who do you admire or already follow in this area?',
      es: '¿A quién admiras o ya sigues en este tema?',
    },
    helper: {
      pt: 'Pessoas, marcas, podcasts, sites, perfis... Opcional, mas vou priorizar conteúdo dessas fontes.',
      en: 'People, brands, podcasts, sites, profiles... Optional, but I\'ll prioritize content from these sources.',
      es: 'Personas, marcas, podcasts, sitios, perfiles... Opcional, pero priorizaré contenido de esas fuentes.',
    },
    placeholder: {
      pt: 'Ex: Lex Fridman, Hacker News, Anthropic, Cazé TV...',
      en: 'E.g. Lex Fridman, Hacker News, Anthropic, The Verge...',
      es: 'Ej: Lex Fridman, Hacker News, Anthropic, Xataka...',
    },
  },
  formatos: {
    q: {
      pt: 'Que formatos você mais gosta de consumir?',
      en: 'Which formats do you enjoy most?',
      es: '¿Qué formatos prefieres consumir?',
    },
    helper: {
      pt: 'Vou priorizar esses no que te trago.',
      en: "I'll prioritize these in what I bring you.",
      es: 'Priorizaré estos en lo que te traiga.',
    },
    chips: {
      pt: ['Artigos longos', 'Notícias rápidas', 'Posts de redes / threads', 'Vídeos / podcasts', 'Estudos / papers'],
      en: ['Long-form articles', 'Quick news', 'Social posts / threads', 'Videos / podcasts', 'Studies / papers'],
      es: ['Artículos largos', 'Noticias rápidas', 'Publicaciones / hilos', 'Videos / podcasts', 'Estudios / papers'],
    },
  },
  ignorar: {
    q: {
      pt: 'O que você NÃO quer receber?',
      en: "What do you NOT want to receive?",
      es: '¿Qué NO quieres recibir?',
    },
    helper: {
      pt: 'Padrões irritantes ou temas específicos. Quanto mais claro, mais limpo fica o email.',
      en: 'Annoying patterns or specific topics. The clearer, the cleaner your email.',
      es: 'Patrones molestos o temas concretos. Cuanto más claro, más limpio queda el email.',
    },
    chips: {
      pt: ['Conteúdo muito básico', 'Notícias internacionais', 'Tutoriais passo a passo', 'Opinião e polêmica'],
      en: ['Overly basic content', 'International news', 'Step-by-step tutorials', 'Opinion & controversy'],
      es: ['Contenido muy básico', 'Noticias internacionales', 'Tutoriales paso a paso', 'Opinión y polémica'],
    },
  },
  topicos: {
    q: {
      pt: 'Pra fechar — que tópicos, ferramentas, marcas ou conceitos estão no seu radar agora?',
      en: 'To wrap up — what topics, tools, brands or concepts are on your radar right now?',
      es: 'Para cerrar — ¿qué temas, herramientas, marcas o conceptos tienes en el radar ahora?',
    },
    helper: {
      pt: 'Quanto mais específico, melhor. Digite o que vem na cabeça e dá enter. Tem sugestões personalizadas abaixo.',
      en: 'The more specific, the better. Type what comes to mind and hit enter. Personalized suggestions below.',
      es: 'Cuanto más específico, mejor. Escribe lo que se te ocurra y pulsa enter. Hay sugerencias personalizadas abajo.',
    },
    placeholder: {
      pt: 'Ex: IA generativa, maratona de 21k, restauração de móveis...',
      en: 'E.g. generative AI, half-marathon training, furniture restoration...',
      es: 'Ej: IA generativa, entreno de media maratón, restauración de muebles...',
    },
  },
  horario: {
    q: {
      pt: 'Que horário você prefere receber?',
      en: 'What time do you prefer to receive it?',
      es: '¿A qué hora prefieres recibirlo?',
    },
    helper: {
      pt: 'Hora cheia (HH:00). Pode escolher um dos sugeridos ou digitar outro.',
      en: 'On the hour (HH:00). Pick a suggestion or type your own.',
      es: 'En punto (HH:00). Elige una sugerencia o escribe otra.',
    },
    placeholder: {
      pt: 'Ex: 14:00, 22:00...',
      en: 'E.g. 14:00, 22:00...',
      es: 'Ej: 14:00, 22:00...',
    },
  },
};

/** Monta as perguntas no idioma dado. Texto traduzido; contexto/frequencia usam
 *  chips com VALOR=slug estável e RÓTULO traduzido (via optionLabels). */
export function getQuestions(locale: Locale): Question[] {
  const ctx = contextoOptions(locale);
  const freq = frequenciaOptions(locale);
  const optLabels = (opts: { value: string; label: string }[]) =>
    Object.fromEntries(opts.map((o) => [o.value, o.label]));

  return [
    {
      id: 'nome', type: 'single',
      question: TXT.nome.q[locale], helper: TXT.nome.helper![locale],
      chips: [], allowFree: true, placeholder: TXT.nome.placeholder![locale], required: true,
    },
    {
      id: 'tema', type: 'multi',
      question: TXT.tema.q[locale], helper: TXT.tema.helper![locale],
      chips: TXT.tema.chips![locale], allowFree: true, minSelections: 1, required: true,
    },
    {
      id: 'contexto', type: 'multi',
      question: TXT.contexto.q[locale], helper: TXT.contexto.helper![locale],
      chips: ctx.map((o) => o.value), optionLabels: optLabels(ctx),
      allowFree: false, minSelections: 1, required: true,
    },
    {
      id: 'descricao_livre', type: 'single',
      question: TXT.descricao_livre.q[locale], helper: TXT.descricao_livre.helper![locale],
      chips: [], allowFree: true, multiline: true, placeholder: TXT.descricao_livre.placeholder![locale],
      condicional: { dependsOn: 'contexto', values: ['profession', 'study'] },
      required: false,
    },
    {
      id: 'objetivo', type: 'multi',
      question: TXT.objetivo.q[locale], helper: TXT.objetivo.helper![locale],
      chips: TXT.objetivo.chips![locale], allowFree: true, minSelections: 1, required: true,
    },
    {
      id: 'referencias', type: 'multi',
      question: TXT.referencias.q[locale], helper: TXT.referencias.helper![locale],
      chips: [], allowFree: true, inputFirst: true, placeholder: TXT.referencias.placeholder![locale],
      required: false,
    },
    {
      id: 'formatos', type: 'multi',
      question: TXT.formatos.q[locale], helper: TXT.formatos.helper![locale],
      chips: TXT.formatos.chips![locale], allowFree: false, minSelections: 1, required: true,
    },
    {
      id: 'ignorar', type: 'multi',
      question: TXT.ignorar.q[locale], helper: TXT.ignorar.helper![locale],
      chips: TXT.ignorar.chips![locale], allowFree: true, required: false,
    },
    {
      id: 'topicos', type: 'multi',
      question: TXT.topicos.q[locale], helper: TXT.topicos.helper![locale],
      chips: [], dynamic: true, allowFree: true, inputFirst: true, minSelections: 1,
      placeholder: TXT.topicos.placeholder![locale], required: true,
    },
    {
      id: 'frequencia', type: 'single',
      question: { pt: 'Com que frequência quer receber?', en: 'How often do you want to receive it?', es: '¿Con qué frecuencia quieres recibirlo?' }[locale],
      helper: { pt: 'Pode mudar depois. Mais frequente = email mais enxuto e fresco; mais espaçado = mais denso.', en: 'You can change this later. More frequent = leaner, fresher email; spaced out = denser.', es: 'Puedes cambiarlo después. Más frecuente = email más breve y fresco; más espaciado = más denso.' }[locale],
      chips: freq.map((o) => o.value), optionLabels: optLabels(freq),
      allowFree: false, required: true,
    },
    {
      id: 'horario', type: 'single',
      question: TXT.horario.q[locale], helper: TXT.horario.helper![locale],
      chips: ['06:00', '08:00', '12:00', '18:00', '21:00'], allowFree: true,
      placeholder: TXT.horario.placeholder![locale], required: true,
    },
  ];
}

/** Avalia se uma pergunta condicional deve ser mostrada. Normaliza contexto
 *  (slug ou rótulo legado) antes de comparar. */
export function isQuestionShown(
  q: Question,
  answers: Record<QuestionId, string | string[]>,
): boolean {
  if (!q.condicional) return true;
  const val = answers[q.condicional.dependsOn];
  const isContexto = q.condicional.dependsOn === 'contexto';
  // contexto agora é múltipla escolha (array de slugs); normaliza cada item.
  if (Array.isArray(val)) {
    const vals = isContexto ? val.map((v) => normalizeContexto(v) ?? v) : val;
    return vals.some((v) => q.condicional!.values.includes(v));
  }
  const single = isContexto && typeof val === 'string' ? (normalizeContexto(val) ?? val) : val;
  return typeof single === 'string' && q.condicional.values.includes(single);
}
