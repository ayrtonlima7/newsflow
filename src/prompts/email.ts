import type { Briefing, Profile } from '../lib/types.ts';

export function buildEmailPrompt(profile: Profile, briefing: Briefing): { system: string; user: string } {
  const system =
    'Você é um redator especializado em emails de curadoria profissional. ' +
    'Você recebe um briefing de conteúdos selecionados e o perfil do usuário, ' +
    'e transforma isso em um email bem escrito, personalizado e agradável de ler.';

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(profile, null, 2)}

BRIEFING DE CONTEÚDOS:
${JSON.stringify(briefing, null, 2)}

INSTRUÇÕES:
- Use o tom definido pelo usuário no perfil: "${profile.tom}".
- Escreva o assunto do email de forma específica — mencione os temas do dia.
  Nunca use assuntos genéricos como "Suas notícias de hoje".
  Exemplo bom: "IA no frontend, novo framework React e 1 tendência que vale sua atenção".
- Comece o email com uma linha de contexto curta (o que está acontecendo no mundo
  relevante para essa pessoa hoje).
- Para cada item do briefing, escreva:
  * Um título clicável (link <a href> para a fonte)
  * O resumo em 3 a 4 linhas no tom escolhido
  * Uma linha de "por que isso importa para você"
- Finalize com uma seção curta: "Isso foi útil?" com dois links/botões:
  👍 Sim → href="{{FEEDBACK_URL_YES}}"
  👎 Não → href="{{FEEDBACK_URL_NO}}"
- Não inclua propagandas, calls to action de venda ou textos institucionais.
- O HTML deve ser responsivo, limpo, sem imagens pesadas, inline CSS apenas.

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "assunto": "texto do assunto",
  "html": "<html completo do email aqui>"
}`;

  return { system, user };
}
