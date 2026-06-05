import type { Profile } from '../lib/types';
import { frequenciaParaJanela, profileForPrompt } from '../lib/types';
import type { SearchResult } from '../lib/search';

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
): { system: string; user: string } {
  const janela = frequenciaParaJanela(profile.frequencia);
  const p = profileForPrompt(profile);

  const system = `Você escreve para o leitor como um amigo mais experiente, atento e investido no crescimento profissional e pessoal dele. Você leu tudo, separou o que importa, e está repassando — com os detalhes cruciais já mastigados.

Nunca soa institucional, nunca soa "newsletter de marca", nunca tenta vender. Soa como uma pessoa real escrevendo para outra. Calibre o registro pelo contexto do usuário (Profissão = técnico e direto; Estudo = didático sem ser básico; Hobby = caloroso; Curiosidade = acessível) e pelo objetivo dele.

Você recebe RESULTADOS DE BUSCA REAIS (título, URL, trecho) e seleciona os melhores. REGRA ABSOLUTA: só pode usar URLs que estão EXATAMENTE na lista. NUNCA invente, modifique ou complete uma URL — copie verbatim.`;

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

DATA ATUAL: ${janela.todayISO}
JANELA DE FRESCOR: conteúdo dos últimos ${janela.janelaDias} dias (não inclua nada antes de ${janela.cutoffISO}).

RESULTADOS DE BUSCA DISPONÍVEIS (${results.length} itens):
${resultsList}

INSTRUÇÕES:
- SELECIONE entre ${janela.itemsMin} e ${janela.itemsMax} resultados — os mais relevantes pro perfil e mais frescos.
- Use "objetivo" e "contexto" pra calibrar recorte e profundidade. Priorize "topicos" e "referencias". IGNORE o que cai em "ignorar".
- "assunto": específico, mencione os temas do dia. Nunca genérico ("Suas notícias de hoje"). Ex: "VR pra vender projetos, drones em obras e 1 tendência que vale sua atenção".
- "intro": 1-2 frases de abertura.${p.nome ? ` Comece com "Oi ${p.nome}," ou variação natural.` : ''} Diga o que está rolando no mundo relevante pra essa pessoa hoje.
- Para cada item:
  * titulo: claro e fiel ao conteúdo.
  * fonte: nome do veículo (extraia do domínio).
  * url: COPIE EXATAMENTE de um resultado acima. Proibido modificar.
  * data_publicacao: a data do resultado (campo "publicado"); se faltar e não der pra inferir, use ${janela.todayISO}.
  * relevancia: "Alta" ou "Média".
  * corpo: 6 a 10 linhas, denso, na SUA VOZ de amigo. Com fatos concretos do trecho (números, nomes, datas, contexto, implicações) + uma linha integrada explicando por que importa PRA ESSA pessoa (sem cabeçalho "por que importa"). Autocontido: o leitor entende o assunto inteiro sem clicar. NÃO invente fatos além do trecho. Texto puro, SEM HTML.
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

/** Constrói as queries de busca a partir do perfil. Combina tópicos normalizados
 *  com o tema pra dar contexto. Referencias entram como query separada quando há. */
export function buildSearchQueries(profile: Profile): string[] {
  const p = profileForPrompt(profile);
  const queries: string[] = [];

  // Uma query por tópico (são os sinais mais específicos)
  for (const topico of p.topicos) {
    if (topico && topico.trim()) queries.push(topico.trim());
  }

  // Se não houver tópicos (raro), cai pro tema
  if (queries.length === 0 && p.tema.length > 0) {
    queries.push(p.tema.join(' '));
  }

  // Cap em 6 queries pra não estourar o free tier da Tavily
  return queries.slice(0, 6);
}

