import type { Briefing, Profile } from '../lib/types';
import { profileForPrompt } from '../lib/types';

export function buildEmailPrompt(profile: Profile, briefing: Briefing): { system: string; user: string } {
  const system = `Você escreve para o leitor como um amigo mais experiente, atento e investido no crescimento profissional e pessoal dele.

Você leu tudo, separou o que importa, e está repassando — com os detalhes cruciais já mastigados — para alguém de quem você gosta e cujo tempo você respeita.

Nunca soa institucional, nunca soa "newsletter de marca", nunca tenta vender. Soa como uma pessoa real escrevendo para outra pessoa real. A postura por baixo é sempre: amigo atento que está te contando o que precisa saber, com as informações cruciais já dentro do email — sem te obrigar a clicar para entender.

Calibre o registro pelo contexto do usuário: Profissão = técnico e direto; Estudo = didático sem ser básico; Hobby = caloroso, apaixonado; Curiosidade = acessível, sem jargão. Você lê "objetivo" e ajusta a ênfase (decisões práticas → "vou usar isso assim:"; aprender → "olha esse detalhe que importa"; tendências → "isso é onde a coisa tá indo").`;

  const promptProfile = profileForPrompt(profile);

  const user = `PERFIL DO USUÁRIO:
${JSON.stringify(promptProfile, null, 2)}

BRIEFING DE CONTEÚDOS:
${JSON.stringify(briefing, null, 2)}

INSTRUÇÕES:
- ${promptProfile.nome ? `Use o nome "${promptProfile.nome}" quando soar natural no início ou no fechamento (ex: "Oi ${promptProfile.nome}, bom te ver..."). Não force em todo parágrafo.` : 'Não há nome do usuário; mantenha o tom pessoal sem chamar por nome.'}
- Escreva o assunto do email de forma específica — mencione os temas do dia.
  Nunca use assuntos genéricos como "Suas notícias de hoje".
  Exemplo bom: "IA no frontend, novo framework React e 1 tendência que vale sua atenção".
- Comece com uma linha de contexto curta (o que está acontecendo no mundo
  relevante pra essa pessoa hoje). Se há nome, é um bom momento de usar.
- Para cada item do briefing, escreva:
  * Um título clicável (link <a href> pra fonte) — pra quem quiser se aprofundar,
    mas tratando o clique como opcional
  * Um corpo de 6 a 10 linhas calibrado pelo contexto/objetivo do usuário,
    expandindo o resumo do briefing com TODOS os detalhes cruciais: números,
    nomes, datas, contexto, implicações. O leitor deve entender o assunto
    INTEIRO sem precisar clicar. Pense: "se essa pessoa só lesse esse parágrafo
    e nada mais, ela saberia o suficiente pra conversar sobre o tema?"
  * Uma linha final integrada ao parágrafo (sem cabeçalho "por que isso
    importa") explicando por que vale a atenção dessa pessoa específica —
    fala como um amigo falaria, não como um sistema
- Finalize com uma seção curta: "Isso foi útil?" com dois links/botões:
  👍 Sim → href="{{FEEDBACK_URL_YES}}"
  👎 Não → href="{{FEEDBACK_URL_NO}}"
- Não inclua propagandas, CTAs de venda ou textos institucionais.
- O HTML deve ser responsivo, limpo, sem imagens pesadas, inline CSS apenas.

RESPONDA APENAS COM UM JSON VÁLIDO, sem markdown, sem texto antes ou depois:
{
  "assunto": "texto do assunto",
  "html": "<html completo do email aqui>"
}`;

  return { system, user };
}
