import OpenAI from 'openai';
import type { Profile } from './types';
import { normalizeLocale } from './i18n';

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
 * Deriva uma lista de domínios brasileiros relevantes pro perfil usando um LLM
 * forte (DeepSeek reasoning). Chamada 1× por save de perfil (onboarding/settings).
 *
 * Retorna null se:
 * - O locale não for pt (en/es não usam restrição de domínio)
 * - A chave de API não estiver configurada
 * - Qualquer erro ocorrer na chamada ou parsing
 *
 * O consumidor trata null como "use a lista estática".
 */
export async function deriveDomains(profile: Profile): Promise<string[] | null> {
  const locale = normalizeLocale(profile.idioma);
  if (locale !== 'pt') return null;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[deriveDomains] DEEPSEEK_API_KEY ausente — usando lista estática');
    return null;
  }

  const model = process.env.DERIVE_DOMAINS_MODEL ?? 'deepseek-reasoner';
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

  const { system, user } = buildDeriveDomainsPrompt(profile);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1024,
      // deepseek-reasoner (R1) NÃO suporta response_format: json_object.
      // O parâmetro é ignorado e o output vai pra reasoning_content, deixando
      // content vazio. A instrução "Responda APENAS com um objeto JSON" no
      // prompt é suficiente pro reasoning model.
    });

    // R1 pode devolver conteúdo em reasoning_content em vez de content.
    const msg = response.choices[0]?.message as {
      content?: string;
      reasoning_content?: string;
    };
    const text = (msg?.content?.trim() || msg?.reasoning_content?.trim()) ?? '';
    if (!text) {
      console.warn('[deriveDomains] resposta vazia do modelo — usando lista estática');
      return null;
    }

    // Extrai JSON (pode vir com fences markdown mesmo com jsonMode)
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Tenta extrair de fences
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.warn('[deriveDomains] resposta sem JSON válido — usando lista estática');
        return null;
      }
      parsed = JSON.parse(match[0]);
    }

    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.domains)) {
      console.warn('[deriveDomains] resposta sem array "domains" — usando lista estática');
      return null;
    }

    const domains = obj.domains.filter(
      (d: unknown): d is string => typeof d === 'string' && d.trim().length > 0,
    );

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
  } catch (err) {
    console.error('[deriveDomains] erro:', err);
    return null;
  }
}
