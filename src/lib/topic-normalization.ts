import { getProvider, extractJson } from './providers';

export interface NormalizeContext {
  tema: string[];
  contexto: string;
  descricao_livre: string;
  objetivo: string;
}

/**
 * Normaliza tópicos brutos digitados pelo usuário em queries estáveis pra LLM
 * com web search. Remove marcadores temporais ("hoje", "esta semana"), corrige
 * typos óbvios, e generaliza framings narrativos que disparam alucinação.
 *
 * - Preserva ordem e quantidade.
 * - Em caso de falha, retorna os tópicos originais (fail-open).
 */
export async function normalizeTopics(
  topics: string[],
  ctx: NormalizeContext,
): Promise<string[]> {
  if (!Array.isArray(topics) || topics.length === 0) return [];

  const cleanInput = topics.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (cleanInput.length === 0) return [];

  try {
    const provider = await getProvider(
      process.env.NORMALIZE_LLM_PROVIDER ?? process.env.EMAIL_LLM_PROVIDER,
    );

    const system = `Você normaliza tópicos digitados por usuários para uso como query em um modelo de curadoria com web search. Marcadores temporais, gírias e typos disparam alucinação no modelo de busca; sua saída precisa ser estável e factual.`;

    const contextLine = [
      `Tema(s) do usuário: ${ctx.tema.join(', ')}`,
      `Contexto: ${ctx.contexto || 'não informado'}`,
      ctx.descricao_livre ? `Sobre o usuário: ${ctx.descricao_livre}` : null,
      ctx.objetivo ? `Objetivo: ${ctx.objetivo}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const user = `CONTEXTO DO USUÁRIO:
${contextLine}

REGRAS:
- Remova marcadores temporais ("hoje", "esta semana", "amanhã", "agora", datas, "do momento", "atualmente").
- Corrija typos óbvios (ex: "cloude code" → "Claude Code", "Reactnative" → "React Native", "chat gpt" → "ChatGPT").
- Mantenha tópicos específicos e factuais — NÃO generalize demais.
- Preserve o idioma original (PT-BR fica PT-BR).
- Cada tópico deve virar uma frase nominal de 2 a 12 palavras, sem perguntas, sem imperativos.
- TRANSFORME nome de FONTE/CONTA em ASSUNTO buscável. A saída é uma query de
  NOTÍCIA, não o nome de uma conta/canal/perfil. Remova framing de rede social
  e de fonte: "(Twitter/Instagram)", "(Instagram)", "conta @x", "perfil de",
  "Central do", "Podcast X", "Canal Y", "Site Z". Extraia a ENTIDADE + o ASSUNTO
  que essa fonte cobre.
- Se o tópico já está bom como query de notícia, devolva ele igual.
- NÃO invente conceitos novos, NÃO adicione tópicos, NÃO remova tópicos.
- Considere o contexto do usuário (Profissão/Estudo/Hobby/Curiosidade) pra decidir o registro: "Hobby" tolera termos coloquiais; "Profissão" prefere terminologia técnica.

EXEMPLOS:
- "novidades de ia hoje" → "Inteligência Artificial generativa e LLMs"
- "cloude code" → "Claude Code (Anthropic CLI/SDK)"
- "react native" → "React Native"
- "renderização em tempo real e experiências imersivas para clientes" → "Renderização em tempo real e experiências imersivas para clientes"
- "drone fotogrametria" → "Drones e fotogrametria para levantamento de terreno"
- "futuro do trabalho" → "Futuro do trabalho e transformação profissional"
- "Central do Botafogo (Twitter/Instagram)" → "Botafogo notícias e bastidores"
- "Podcast GE Botafogo" → "Botafogo análise e Brasileirão"
- "Mercado da Bola Botafogo (Instagram)" → "Botafogo mercado da bola e contratações"
- "Estatísticas Sofascore Brasileirão" → "Brasileirão estatísticas e desempenho dos times"

TÓPICOS DO USUÁRIO (mantenha a ordem e a quantidade exatas):
${JSON.stringify(cleanInput, null, 2)}

Responda APENAS com um JSON neste formato (sem markdown, sem texto antes/depois):
{ "normalized": ["...", "..."] }

A lista "normalized" deve ter EXATAMENTE ${cleanInput.length} elemento(s), na mesma ordem dos tópicos de entrada.`;

    const result = await provider.complete({
      system,
      messages: [{ role: 'user', content: user }],
      webSearch: false,
      maxTokens: 2048,
      jsonMode: true,
    });

    if (!result.text.trim()) {
      console.warn('[normalizeTopics] resposta vazia, mantendo tópicos originais');
      return topics;
    }

    const parsed = extractJson<{ normalized?: unknown }>(result.text);
    const arr = parsed?.normalized;
    if (!Array.isArray(arr) || arr.length !== cleanInput.length) {
      console.warn(
        `[normalizeTopics] tamanho errado (esperado ${cleanInput.length}, veio ${Array.isArray(arr) ? arr.length : 'não-array'}). Mantendo originais.`,
      );
      return topics;
    }
    const normalized = arr.map((v, i) => {
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      return topics[i];
    });
    return normalized;
  } catch (err) {
    console.warn('[normalizeTopics] erro, mantendo tópicos originais:', err);
    return topics;
  }
}
