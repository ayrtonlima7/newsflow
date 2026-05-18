import type { Profile } from '@/src/lib/types';

type BaseQuestion = {
  id: keyof Omit<Profile, 'descricoes_livres' | 'topicos_busca'>;
  question: string;
  helper?: string;
  chips: string[];
  allowFree: boolean;
};

export type SingleQuestion = BaseQuestion & { type: 'single' };

export type MultiQuestion = BaseQuestion & {
  type: 'multi';
  dynamic?: boolean;
  minSelections?: number;
};

export type Question = SingleQuestion | MultiQuestion;

export const questions: Question[] = [
  {
    id: 'area',
    type: 'single',
    question: 'Para começar, qual é a sua área de atuação?',
    chips: ['Tecnologia', 'Saúde', 'Educação', 'Finanças', 'Marketing', 'Direito', 'Design', 'Gastronomia'],
    allowFree: true,
  },
  {
    id: 'cargo',
    type: 'single',
    question: 'E qual é o seu cargo ou função principal?',
    chips: ['Desenvolvedor', 'Designer', 'Gestor', 'Analista', 'Professor', 'Autônomo'],
    allowFree: true,
  },
  {
    id: 'topicos',
    type: 'multi',
    question: 'Quais tópicos você quer acompanhar?',
    helper: 'Pode escolher mais de um. Vou sugerir alguns baseados no que você me contou.',
    chips: [],
    dynamic: true,
    allowFree: true,
    minSelections: 1,
  },
  {
    id: 'ignorar',
    type: 'multi',
    question: 'E o que você NÃO quer receber?',
    helper: 'O ruído que costuma te incomodar no inbox.',
    chips: [
      'Conteúdo muito básico/iniciante',
      'Notícias de outros países',
      'Tutoriais passo a passo',
      'Opinião e polêmica',
    ],
    allowFree: true,
  },
  {
    id: 'frequencia',
    type: 'single',
    question: 'Com que frequência quer receber?',
    chips: ['Todo dia de manhã', 'Todo dia à noite', 'Dias úteis apenas', 'Uma vez por semana'],
    allowFree: false,
  },
  {
    id: 'horario',
    type: 'single',
    question: 'Qual horário prefere?',
    chips: ['7h', '8h', '12h', '18h', '21h'],
    allowFree: true,
  },
  {
    id: 'tom',
    type: 'single',
    question: 'Que tom de escrita combina mais com você?',
    chips: ['Direto e técnico', 'Analítico com contexto', 'Leve e conversacional', 'Formal e objetivo'],
    allowFree: false,
  },
  {
    id: 'fontes_prioritarias',
    type: 'multi',
    question: 'Alguma fonte que você já gosta e quer que seja priorizada?',
    helper: 'Opcional. Pode pular se não tiver nada específico em mente.',
    chips: ['Twitter/X', 'LinkedIn', 'Reddit', 'Hacker News', 'YouTube'],
    allowFree: true,
  },
];
