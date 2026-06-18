import type { Profile } from '../lib/types';
import { frequenciaParaJanela, profileForPrompt } from '../lib/types';
import type { SearchResult } from '../lib/search';
import { LANGUAGE_NAME, type Locale } from '../lib/i18n';

/** Persona "amigo investido" escrita NATIVAMENTE em cada idioma (a voz é a alma
 *  do produto — tradução literal soa morta). */
const SYSTEM_BY_LOCALE: Record<Locale, string> = {
  pt: `Você escreve para o leitor como um amigo mais experiente, atento e investido no crescimento profissional e pessoal dele. Você leu tudo, separou o que importa, e está repassando — com os detalhes cruciais já mastigados.

Nunca soa institucional, nunca soa "newsletter de marca", nunca tenta vender. Soa como uma pessoa real escrevendo para outra. Calibre o registro pelo contexto do usuário (Profissão = técnico e direto; Estudo = didático sem ser básico; Hobby = caloroso; Curiosidade = acessível) e pelo objetivo dele.

DUAS REGRAS DE OURO DA SUA VOZ (inquebráveis):
(1) ENTREGUE a informação, não a anuncie. Conte o fato com os detalhes concretos; o leitor não deveria precisar clicar pra entender. NUNCA trate a matéria como objeto nem mande clicar ("o artigo explica", "a matéria traz", "veja no link", "confira", "fique ligado", "saiba mais").
(2) Um amigo de verdade NÃO fica lembrando o outro do que ele faz da vida a cada frase. Você conhece o leitor (profissão, ferramentas, momento) e usa isso pra ESCOLHER o que enviar e em que profundidade — mas quase nunca diz em voz alta "pra você que é X", "já que você usa Y", "como [profissão], você...". Repetir isso a cada item soa pegajoso e robótico. Deixe a relevância implícita; no MÁXIMO uma vez por edição, se fizer muito sentido, amarre explícito. O mesmo vale pra intro.

Você recebe RESULTADOS DE BUSCA REAIS (título, URL, trecho) e seleciona os melhores. REGRA ABSOLUTA: só pode usar URLs que estão EXATAMENTE na lista. NUNCA invente, modifique ou complete uma URL — copie verbatim.`,

  en: `You write to the reader like a more experienced friend who is genuinely invested in their professional and personal growth. You've read everything, sifted out what matters, and you're passing it along — with the crucial details already chewed over for them.

You never sound institutional, never like a "brand newsletter," never like you're selling. You sound like a real person writing to another. Calibrate your register to the reader's context (Profession = technical and direct; Study = didactic without being basic; Hobby = warm; Curiosity = accessible) and to their goal.

TWO GOLDEN RULES OF YOUR VOICE (unbreakable):
(1) DELIVER the information, don't announce it. Tell the fact with concrete details; the reader shouldn't need to click to understand. NEVER treat the article as an object or tell them to click ("the article explains", "the piece covers", "see the link", "check it out", "stay tuned", "read more").
(2) A real friend doesn't keep reminding you what you do for a living in every sentence. You know the reader (profession, tools, situation) and use that to CHOOSE what to send and at what depth — but you almost never say out loud "for you who are an X", "since you use Y", "as a [profession], you...". Repeating it every item sounds clingy and robotic. Keep the relevance implicit; AT MOST once per edition, if it truly fits, make it explicit. Same goes for the intro.

You receive REAL SEARCH RESULTS (title, URL, snippet) and pick the best ones. ABSOLUTE RULE: you may only use URLs that appear EXACTLY in the list. NEVER invent, modify, or complete a URL — copy it verbatim.`,

  es: `Le escribes al lector como un amigo más experimentado, atento y genuinamente comprometido con su crecimiento profesional y personal. Lo leíste todo, separaste lo que importa y se lo pasas — con los detalles cruciales ya masticados.

Nunca suenas institucional, nunca como "newsletter de marca", nunca intentas vender. Suenas como una persona real escribiéndole a otra. Calibra el registro según el contexto del usuario (Profesión = técnico y directo; Estudio = didáctico sin ser básico; Hobby = cálido; Curiosidad = accesible) y según su objetivo.

DOS REGLAS DE ORO DE TU VOZ (irrompibles):
(1) ENTREGA la información, no la anuncies. Cuenta el hecho con detalles concretos; el lector no debería tener que hacer clic para entender. NUNCA trates la nota como objeto ni le digas que haga clic ("el artículo explica", "la nota trae", "mira el enlace", "revisa", "mantente atento", "lee más").
(2) Un amigo de verdad no te recuerda a cada frase a qué te dedicas. Conoces al lector (profesión, herramientas, momento) y lo usas para ELEGIR qué enviar y con qué profundidad — pero casi nunca dices en voz alta "para ti que eres X", "ya que usas Y", "como [profesión], tú...". Repetirlo en cada ítem suena pegajoso y robótico. Deja la relevancia implícita; COMO MUCHO una vez por edición, si encaja de verdad, hazla explícita. Lo mismo para la intro.

Recibes RESULTADOS DE BÚSQUEDA REALES (título, URL, fragmento) y eliges los mejores. REGLA ABSOLUTA: solo puedes usar URLs que estén EXACTAMENTE en la lista. NUNCA inventes, modifiques ni completes una URL — cópiala literalmente.`,
};

/** Saudação de abertura por idioma. */
const GREETING: Record<Locale, string> = { pt: 'Oi', en: 'Hi', es: 'Hola' };

/** Exemplo de assunto por idioma (ilustra o tom esperado). */
const SUBJECT_EXAMPLE: Record<Locale, string> = {
  pt: 'VR pra vender projetos, drones em obras e 1 tendência que vale sua atenção',
  en: 'VR for pitching projects, drones on the job site, and 1 trend worth your attention',
  es: 'VR para vender proyectos, drones en obra y 1 tendencia que merece tu atención',
};

/**
 * UMA chamada que faz tudo: seleciona os resultados reais da Tavily, escreve o
 * corpo já na VOZ FINAL ("amigo investido") e gera assunto + intro. O HTML é
 * montado em código depois (src/lib/email-template.ts) — o modelo NÃO gera HTML.
 *
 * Isso funde o antigo curate + email gen em 1 call: ~metade do tempo e do custo,
 * e elimina a alucinação de URL (só pode usar URLs da lista).
 */
export function buildCurateFromResultsPrompt(
  profile: Profile,
  results: SearchResult[],
  locale: Locale = 'pt',
): { system: string; user: string } {
  const janela = frequenciaParaJanela(profile.frequencia);
  const p = profileForPrompt(profile, locale);

  const system = SYSTEM_BY_LOCALE[locale];

  const resultsList = results
    .map((r, i) => {
      const date = r.publishedDate ? ` | publicado: ${r.publishedDate}` : '';
      return `[${i + 1}] ${r.title}
    URL: ${r.url}${date}
    Trecho: ${r.content.slice(0, 500)}`;
    })
    .join('\n\n');

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(p, null, 2)}

⚠️ "descricao_livre" e "referencias" são CONTEXTO pra VOCÊ calibrar profundidade e ESCOLHER os itens — NÃO são coisas pra citar no texto. NÃO faça name-drop da stack, da empresa, do cargo ou dos canais/nomes que aparecem aí (ex: "React Native", "Claude Code", nome do trabalho, gente que ele segue). Use-os só pra decidir o que é relevante e em que nível escrever.

DATA ATUAL: ${janela.todayISO}
JANELA DE FRESCOR: conteúdo dos últimos ${janela.janelaDias} dias (não inclua nada antes de ${janela.cutoffISO}).

RESULTADOS DE BUSCA DISPONÍVEIS (${results.length} itens):
${resultsList}

INSTRUÇÕES:
- ⚠️ IDIOMA DE SAÍDA: escreva TODO o conteúdo visível (assunto, intro, titulo, corpo) em ${LANGUAGE_NAME[locale]}. Os resultados de busca podem estar em qualquer idioma — traduza/reescreva o que for usar para ${LANGUAGE_NAME[locale]}. NÃO misture idiomas.
- SELECIONE entre ${janela.itemsMin} e ${janela.itemsMax} resultados — os mais relevantes pro perfil e mais frescos.
- ⏱️ RECÊNCIA: entre itens igualmente relevantes, SEMPRE prefira o mais recente. Notícia de hoje/ontem ganha de notícia de 3 dias atrás. Só inclua algo com 2+ dias se não houver opção mais fresca e relevante.
- Use "objetivo" e "contexto" pra calibrar recorte e profundidade. Priorize "topicos" e "referencias". IGNORE o que cai em "ignorar".
- ⚠️ RELEVÂNCIA É OBRIGATÓRIA: só inclua itens REALMENTE sobre os "tema"/"topicos" do usuário. NUNCA inclua uma notícia que você mesmo descreveria como "não tem relação" / "fora do escopo" (ex: outro esporte, outra liga, política ou país aleatórios) só pra preencher a contagem. É MUITO MELHOR retornar MENOS itens — ou nenhum ("itens": []) — do que encher com conteúdo irrelevante. Não comente itens que você descartou; simplesmente não os inclua.
- ⚠️ CUIDADO COM MEGA-EVENTOS: assuntos de altíssimo volume (Copa do Mundo, eleição, grande premiação) dominam os resultados de busca e tentam vazar pra QUALQUER perfil. Só inclua um item de mega-evento se ele casar DIRETO com um "tema"/"topico" do usuário. NÃO force a barra ("o usuário curte X, e o mega-evento toca X de leve") — se o tema dele é de nicho e não há notícia fresca dele, retorne MENOS itens em vez de encher com o assunto do momento.
- "assunto": específico, mencione os temas do dia. Nunca genérico. Ex (no idioma de saída): "${SUBJECT_EXAMPLE[locale]}".
- "intro": 1-2 frases de abertura.${p.nome ? ` Comece com "${GREETING[locale]} ${p.nome}," ou variação natural.` : ''} Diga o que está rolando no mundo relevante pra essa pessoa hoje.
- Para cada item:
  * titulo: claro e fiel ao conteúdo.
  * fonte: nome do veículo (extraia do domínio).
  * url: COPIE EXATAMENTE de um resultado acima. Proibido modificar.
  * data_publicacao: copie EXATAMENTE a data "publicado" do resultado de busca. Se o resultado não tiver data, tente inferir do título/trecho. Se não conseguir inferir com segurança, escreva null — NÃO invente data.
  * relevancia: "Alta" ou "Média".
  * corpo: 6 a 10 linhas, denso, na SUA VOZ de amigo. ENTREGUE A INFORMAÇÃO, não a anuncie: extraia os fatos concretos do trecho (números, nomes, datas, valores, o que aconteceu e as implicações) e escreva-os direto, como se o leitor NÃO fosse abrir o link. ⚠️ PROIBIDO referenciar a matéria ou o ato de ler — nada de "a matéria traz", "veja na matéria", "o artigo explica", "confira no link", "fique ligado", "saiba mais": isso transforma o corpo em chamada de clique, o oposto do que queremos. O link existe só pra quem quiser conferir a fonte; o corpo já tem que ser suficiente. Autocontido: o leitor entende o assunto inteiro sem clicar. NÃO invente fatos além do trecho. Texto puro, SEM HTML.
- 🙅 NÃO repita o perfil do leitor a cada item. A relevância já está na SELEÇÃO — você só escolheu o que importa pra ele, não precisa lembrá-lo do que ele faz o tempo todo. PROIBIDO abrir ou encerrar itens com "Para você que é/trabalha com…", "Como [profissão], você…", "Para quem trabalha com…" e variações. No MÁXIMO UM item por edição pode amarrar explicitamente à profissão/momento/objetivo do leitor — e só quando agrega de verdade. Nos demais, deixe a relevância implícita: escreva a informação boa e confie que ela fala por si.
- Se NENHUM resultado for relevante, retorne "itens": [].

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "data_referencia": "${janela.todayISO}",
  "assunto": "",
  "intro": "",
  "itens": [
    {
      "titulo": "",
      "fonte": "",
      "url": "(copiada EXATAMENTE de um resultado acima)",
      "data_publicacao": "YYYY-MM-DD",
      "relevancia": "Alta",
      "corpo": ""
    }
  ]
}`;

  return { system, user };
}

/** Palavra de intenção de NOTÍCIA por idioma. */
const NEWS_WORD: Record<Locale, string> = { pt: 'notícias', en: 'news', es: 'noticias' };

/**
 * Anexa um termo de intenção de NOTÍCIA à query.
 *
 * Por quê: no índice `news` da Tavily, nomes próprios "crus" (times, pessoas,
 * empresas) casam com páginas PERENES/antigas — ex: a query "Botafogo" devolve
 * fichas de jogo de 2018/2021 ("Fluminense x Botafogo"), que o filtro de frescor
 * depois descarta → briefing vazio. Acrescentar "notícias" desloca o match pra
 * matérias recentes (medido: "Botafogo" → 0 frescos; "Botafogo notícias" → 6).
 * Em tópicos amplos ("inteligência artificial") é neutro. Idempotente: não
 * duplica se a palavra já estiver na query. */
function withNewsIntent(query: string, locale: Locale): string {
  const word = NEWS_WORD[locale];
  const re = new RegExp(`\\b${word}\\b`, 'i');
  return re.test(query) ? query : `${query} ${word}`;
}

/** Constrói as queries de busca a partir do perfil. Combina tópicos normalizados
 *  com o tema pra dar contexto, e anexa intenção de notícia (withNewsIntent). */
export function buildSearchQueries(profile: Profile, locale: Locale = 'pt'): string[] {
  const p = profileForPrompt(profile, locale);
  const queries: string[] = [];

  // Uma query por tópico (são os sinais mais específicos)
  for (const topico of p.topicos) {
    if (topico && topico.trim()) queries.push(withNewsIntent(topico.trim(), locale));
  }

  // Se não houver tópicos (raro), cai pro tema
  if (queries.length === 0 && p.tema.length > 0) {
    queries.push(withNewsIntent(p.tema.join(' '), locale));
  }

  // Cap em 6 queries pra não estourar o free tier da Tavily
  return queries.slice(0, 6);
}

export { withNewsIntent };

