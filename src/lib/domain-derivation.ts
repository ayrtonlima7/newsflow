import OpenAI from 'openai';
import type { Profile } from './types';
import { normalizeLocale } from './i18n';
import { extractJson } from './providers';

/** Catálogo completo de domínios brasileiros de qualidade, organizado por
 *  vertical. Usado pelo prompt de derivação pra o LLM escolher um subconjunto
 *  relevante pro perfil. Se adicionar domínios na lista estática de
 *  pipeline.ts, adicione aqui também. */
const DOMAIN_CATALOG: Record<string, string[]> = {
  'Notícia geral': [
    'g1.globo.com', 'oglobo.globo.com', 'uol.com.br', 'folha.uol.com.br',
    'estadao.com.br', 'cnnbrasil.com.br', 'terra.com.br', 'metropoles.com',
    'r7.com', 'band.uol.com.br', 'cartacapital.com.br', 'gazetadopovo.com.br',
    'poder360.com.br', 'agenciabrasil.ebc.com.br', 'brasil.elpais.com',
  ],
  Esporte: [
    'ge.globo.com', 'lance.com.br', 'espn.com.br', 'trivela.com.br',
  ],
  'Economia / negócios': [
    'valor.globo.com', 'exame.com', 'infomoney.com.br', 'braziljournal.com',
    'neofeed.com.br', 'moneytimes.com.br',
  ],
  Tecnologia: [
    'tecmundo.com.br', 'canaltech.com.br', 'olhardigital.com.br',
    'tecnoblog.net', 'meiobit.com', 'mobiletime.com.br',
  ],
  'Ciência / saúde / cultura': [
    'veja.abril.com.br', 'super.abril.com.br', 'saude.abril.com.br',
    'revistagalileu.globo.com', 'omelete.com.br',
  ],
};

/** Conjunto de todos os domínios do catálogo pra validação rápida. */
const ALL_CATALOG_DOMAINS = new Set(
  Object.values(DOMAIN_CATALOG).flat(),
);

/** Modelo de fallback confiável. deepseek-chat sempre popula `content` e suporta
 *  JSON mode — usado quando o modelo configurado volta vazio ou dá erro. */
const FALLBACK_MODEL = 'deepseek-chat';

/** Heurística: o modelo é de raciocínio (R1)? Reasoners NÃO suportam
 *  response_format json_object e mandam a resposta pro reasoning_content. */
export function isReasonerModel(model: string): boolean {
  return /reasoner|r1/i.test(model);
}

/** Normaliza um domínio devolvido pelo LLM. Domínios são case-insensitive e nunca
 *  têm espaço — então minúscula + remover espaços é sempre seguro e ainda cura
 *  typos do modelo (ex: "agencia Brasil.ebc.com.br" → "agenciabrasil.ebc.com.br",
 *  que volta a casar com o catálogo). */
export function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/** Ordena os modelos a tentar: o configurado primeiro, depois o fallback
 *  confiável (se for diferente). Sem duplicar quando já são iguais. */
export function resolveDeriveModels(primary: string): string[] {
  return primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];
}

function buildDeriveDomainsPrompt(profile: Profile): { system: string; user: string } {
  const tema = profile.tema?.join(', ') || 'não informado';
  const contexto = profile.contexto?.join(', ') || 'não informado';
  const objetivo = profile.objetivo?.join(', ') || 'não informado';
  const topicos = profile.topicos?.join(', ') || 'não informado';
  const descricao = profile.descricao_livre || '';

  const catalogLines = Object.entries(DOMAIN_CATALOG)
    .map(([vertical, domains]) => `  ${vertical}: ${domains.join(', ')}`)
    .join('\n');

  const system = [
    'Você é um especialista em mídia brasileira. Sua tarefa: dado o perfil de um usuário,',
    'selecionar do catálogo abaixo os domínios de notícias brasileiros mais relevantes',
    'pra cobrir os interesses daquela pessoa.',
    '',
    'Catálogo de domínios disponíveis (organizado por vertical):',
    catalogLines,
    '',
    'Regras:',
    '1. SEMPRE inclua um núcleo de notícia geral (pelo menos 4: g1, uol, folha, estadao',
    '   ou equivalente) — breaking news relevantes podem vir de qualquer editoria.',
    '2. Adicione domínios de verticais que casam com os temas e tópicos do usuário.',
    '   Ex: tech → tecmundo, canaltech, tecnoblog; economia → valor, exame, infomoney.',
    '3. NÃO invente domínios. Só use os que estão no catálogo.',
    '4. Selecione por volta de 50 domínios — a lista é grande e cobrir bem é mais',
    '   importante que enxugar. O buscador faz seu próprio ranking de relevância,',
    '   então incluir um domínio "a mais" não polui os resultados.',
    '5. Se o catálogo não tiver domínios suficientes que se encaixem no perfil,',
    '   tudo bem selecionar menos — qualidade > quantidade forçada. Não há piso.',
    '6. Se o perfil for muito generalista (vários temas, hobby/curiosidade), selecione',
    '   um leque amplo cobrindo várias verticais.',
    '7. Se o perfil for muito focado (ex: só tech + profissão), carregue na vertical',
    '   relevante mas mantenha um piso de 4-6 de notícia geral.',
  ].join('\n');

  const userParts = [
    `Tema(s): ${tema}`,
    `Contexto: ${contexto}`,
    `Objetivo: ${objetivo}`,
    `Tópicos de interesse: ${topicos}`,
  ];
  if (descricao) {
    userParts.push(`Sobre o usuário: ${descricao}`);
  }
  userParts.push(
    '',
    'Selecione os domínios mais relevantes do catálogo pra este perfil.',
    'Responda APENAS com um objeto JSON:',
    '{"domains": ["g1.globo.com", "uol.com.br", ...]}',
  );

  return { system, user: userParts.join('\n') };
}

/**
 * Faz UMA chamada de derivação com um modelo específico e parseia a resposta.
 * Retorna o array de domínios (não-vazio) ou null se o modelo não produziu uma
 * resposta utilizável (content vazio, JSON inválido, sem array, zero domínios).
 * Lança em erro de API (modelo inválido, rede) — o chamador decide o fallback.
 */
async function tryDeriveWithModel(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
): Promise<string[] | null> {
  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // Folgado pro reasoner (R1): com 1024, o reasoning_content (CoT) consome todo
    // o orçamento e o content final vem VAZIO (medido: ~3.5k chars de CoT → content
    // vazio). 4096 dá espaço pra CoT + resposta. Pra chat/v4-flash é só um teto —
    // só pagamos os tokens de saída reais (a lista de domínios é curta).
    max_tokens: 4096,
    // Modelos não-reasoner suportam response_format json_object → resposta mais
    // previsível. deepseek-reasoner (R1) NÃO suporta (ignora e manda tudo pro
    // reasoning_content) — nesse caso confiamos na instrução "Responda APENAS com
    // JSON" do prompt + extractJson.
    ...(isReasonerModel(model)
      ? {}
      : { response_format: { type: 'json_object' as const } }),
  };

  const response = await client.chat.completions.create(params);

  const msg = response.choices[0]?.message as {
    content?: string;
    reasoning_content?: string;
  };
  const rawContent = msg?.content?.trim() ?? '';
  if (!rawContent) {
    console.warn(
      `[deriveDomains] content vazio (modelo ${model})` +
        (msg?.reasoning_content
          ? ` (reasoning_content tem ${msg.reasoning_content.length} chars — ignorado)`
          : ''),
    );
    return null;
  }

  // extractJson do próprio codebase: lida com fences markdown, texto antes/depois
  // do JSON, e brace-matching com escape de string.
  let parsed: { domains?: unknown };
  try {
    parsed = extractJson<{ domains?: unknown }>(rawContent);
  } catch {
    console.warn(
      `[deriveDomains] JSON inválido (modelo ${model}, ${rawContent.length} chars):`,
      rawContent.slice(0, 300),
    );
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.domains)) {
    console.warn(`[deriveDomains] resposta sem array "domains" (modelo ${model})`);
    return null;
  }

  const domains = obj.domains
    .filter((d: unknown): d is string => typeof d === 'string' && d.trim().length > 0)
    .map(normalizeDomain);

  // Loga domínios fora do catálogo (não descarta — o LLM pode conhecer
  // fontes boas que ainda não catalogamos).
  for (const d of domains) {
    if (!ALL_CATALOG_DOMAINS.has(d)) {
      console.warn(`[deriveDomains] domínio fora do catálogo: "${d}" — mantendo mesmo assim`);
    }
  }

  const usage = response.usage;
  console.log(
    `[deriveDomains] ${domains.length} domínios derivados (modelo ${model}) | ` +
      `in=${usage?.prompt_tokens ?? '?'} out=${usage?.completion_tokens ?? '?'} tok`,
  );

  return domains.length > 0 ? domains : null;
}

/**
 * Deriva uma lista de domínios brasileiros relevantes pro perfil usando um LLM.
 * Chamada 1× por save de perfil (onboarding/settings).
 *
 * Robusto a troca de modelo: tenta o `DERIVE_DOMAINS_MODEL` configurado e, se ele
 * voltar vazio ou der erro, cai automaticamente pro `deepseek-chat` antes de
 * desistir. Assim um swap experimental (ex: um modelo que não popula `content`)
 * não mata a feature silenciosamente.
 *
 * Retorna null (→ consumidor usa a lista estática) se:
 * - O locale não for pt (en/es não usam restrição de domínio)
 * - A chave de API não estiver configurada
 * - NENHUM dos modelos produzir uma lista utilizável
 */
export async function deriveDomains(profile: Profile): Promise<string[] | null> {
  const locale = normalizeLocale(profile.idioma);
  if (locale !== 'pt') return null;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[deriveDomains] DEEPSEEK_API_KEY ausente — usando lista estática');
    return null;
  }

  // Default deepseek-chat (não reasoner): a tarefa é selecionar domínios de um
  // catálogo — não precisa de raciocínio. Chat é rápido (~3s), barato, suporta
  // JSON mode e SEMPRE popula content. O reasoner ficava 9.5s e voltava vazio
  // (todo o orçamento ia pro CoT). Pode sobrescrever via DERIVE_DOMAINS_MODEL.
  const primaryModel = process.env.DERIVE_DOMAINS_MODEL ?? 'deepseek-chat';
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const { system, user } = buildDeriveDomainsPrompt(profile);

  const models = resolveDeriveModels(primaryModel);
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const hasNext = i < models.length - 1;
    try {
      const domains = await tryDeriveWithModel(client, model, system, user);
      if (domains) return domains;
      if (hasNext) {
        console.warn(
          `[deriveDomains] modelo "${model}" não produziu domínios — tentando fallback "${models[i + 1]}"`,
        );
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (hasNext) {
        console.warn(
          `[deriveDomains] erro no modelo "${model}" (${m}) — tentando fallback "${models[i + 1]}"`,
        );
      } else {
        console.error(`[deriveDomains] erro no modelo "${model}":`, err);
      }
    }
  }

  console.warn('[deriveDomains] nenhum modelo produziu domínios — usando lista estática');
  return null;
}
