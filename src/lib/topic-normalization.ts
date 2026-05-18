import { getProvider, extractJson } from './providers';

export interface NormalizeContext {
  area: string;
  cargo: string;
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
    // Usa o provider de email (geralmente DeepSeek, mais barato) — tarefa não exige web search
    const provider = await getProvider(
      process.env.NORMALIZE_LLM_PROVIDER ?? process.env.EMAIL_LLM_PROVIDER,
    );

    const system = `Você normaliza tópicos digitados por usuários para uso como query em um modelo de curadoria com web search. Marcadores temporais, gírias e typos disparam alucinação no modelo de busca; sua saída precisa ser estável e factual.`;

    const user = `CONTEXTO DO USUÁRIO:
- Área: ${ctx.area}
- Cargo: ${ctx.cargo}

REGRAS:
- Remova marcadores temporais ("hoje", "esta semana", "amanhã", "agora", datas específicas, "do momento", "atualmente").
- Corrija typos óbvios (ex: "cloude code" → "Claude Code", "Reactnative" → "React Native", "chat gpt" → "ChatGPT").
- Mantenha tópicos específicos e factuais — NÃO generalize demais (ex: "React Native finance app" não vira só "React Native").
- Preserve o idioma original (PT-BR fica PT-BR).
- Cada tópico deve virar uma frase nominal de 2 a 12 palavras, sem perguntas, sem imperativos.
- Se o tópico já está bom, devolva ele igual.
- NÃO invente conceitos novos, NÃO adicione tópicos, NÃO remova tópicos.

EXEMPLOS:
- "novidades de ia hoje" → "Inteligência Artificial generativa e LLMs"
- "cloude code" → "Claude Code (Anthropic CLI/SDK)"
- "react native" → "React Native"
- "o que tá rolando em IA esta semana" → "Inteligência Artificial: lançamentos, papers e produtos recentes"
- "renderização em tempo real e experiências imersivas para clientes" → "Renderização em tempo real e experiências imersivas para clientes"
- "drone fotogrametria" → "Drones e fotogrametria para levantamento de terreno"
- "futuro do trabalho" → "Futuro do trabalho e transformação profissional"

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
        `[normalizeTopics] resposta com tamanho errado (esperado ${cleanInput.length}, veio ${Array.isArray(arr) ? arr.length : 'não-array'}). Mantendo originais.`,
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
