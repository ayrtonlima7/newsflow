---
name: i18n-guard
description: >-
  Garante que TODO texto visível ao usuário criado/alterado numa feature do NewsFlow
  passe pela i18n (pt/en/es) em vez de ficar hardcoded. Use ao FECHAR qualquer
  tarefa que adicione ou edite UI, componentes, páginas, emails ou cópia voltada ao
  usuário — antes de considerar a tarefa pronta. Gatilhos: "terminei a feature",
  "revisar i18n", "tem string faltando tradução?", ou ao criar/editar arquivos em
  app/ e src/ com texto em português hardcoded.
---

# i18n-guard — NewsFlow

Objetivo: nenhuma string nova voltada ao usuário fica hardcoded. Tudo passa pelo
catálogo e é renderizado no idioma do usuário (pt/en/es).

## Quando rodar
Ao concluir qualquer mudança que toque UI/cópia/email. Faça ANTES de declarar a
tarefa pronta (junto do typecheck).

## Arquitetura de i18n (onde tudo vive)
- **Núcleo:** `src/lib/i18n.ts` — `Locale` (`'pt'|'en'|'es'`), `normalizeLocale`,
  `LOCALES`, `LOCALE_LABEL`, `INTL_LOCALE` (datas), `HTML_LANG`, `LOCALE_COOKIE`,
  `localeFromAcceptLanguage`.
- **Catálogo:** `src/lib/messages.ts` — `getDictionary(locale)` + `translate(dict, key, vars)`.
  Chaves PLANAS com namespace por ponto (ex: `login.title`, `sub.priceMonthly`).
  Fallback: chave ausente cai no PT, depois na própria chave (visível).
- **Server components:** `getDictionary(await getLocale())` (de `app/_i18n/locale.ts`),
  depois `translate(dict, 'chave')`.
- **Client components:** `const t = useT()` (de `app/_i18n/provider.tsx`); `useLocale()`
  pra datas/números via `INTL_LOCALE`.
- **Idioma:** por conta. UI lê o cookie `nf_locale`; curadoria/emails leem
  `profile.idioma`. O seletor global (`app/_i18n/language-switcher.tsx`) sincroniza
  os dois.
- **Curadoria (conteúdo do email):** `src/prompts/curate.ts` tem persona NATIVA por
  idioma (`SYSTEM_BY_LOCALE`) + diretiva de idioma de saída; `buildCurateFromResultsPrompt(profile, results, locale)`.
- **Email (chrome):** `src/lib/email-template.ts` → `CHROME[locale]`, `renderEmailHtml(briefing, locale)`.

## Procedimento (siga em ordem)

1. **Liste os arquivos alterados/criados** na tarefa (`git diff --name-only`,
   foco em `app/` e `src/` — `.tsx`, e textos em `.ts`).

2. **Cace strings hardcoded voltadas ao usuário.** Heurística — procure literais
   PT em JSX/atributos (placeholder, aria-label, title, alt, botões, headings,
   toasts):
   ```bash
   grep -rnoE "[\"'`>][^\"'`<>{}]*[áàâãéêíóôõúçÁÉÍÓÚÃÕÇ][^\"'`<>{}]*[\"'`<]" <arquivos> | grep -v "//"
   ```
   E literais sem acento que claramente são UI ("Save", "Cancel", "Loading…").
   Ignore: comentários, nomes de variável, logs `console.*`, chaves do catálogo.

3. **Para cada string encontrada:**
   - Adicione uma chave nova em `src/lib/messages.ts` nos **TRÊS** idiomas (`pt`,
     `en`, `es`). Namespace coerente com a superfície (`login.`, `onb.`, `confirm.`,
     `settings.`, `sub.`, `demail.`, `sample.`, ou um novo).
   - Use `{var}` pra interpolação (ex: `'demail.codeSent': '...{email}...'`) e passe
     `t('chave', { email })`.
   - Substitua o literal no componente:
     - client → `t('chave')`
     - server → `translate(dict, 'chave')`
   - Datas/números → `new Date(iso).toLocaleDateString(INTL_LOCALE[locale], …)`.

4. **Conteúdo de IA / email** (se a feature mexe em curadoria ou template de email):
   o texto gerado deve sair em `profile.idioma`. Verifique que o locale é passado a
   `buildCurateFromResultsPrompt` e `renderEmailHtml`, e que qualquer persona/voz
   nova é escrita NATIVAMENTE nos 3 idiomas (tradução literal soa morta).

5. **Campos de opção lidos por código** (matching em código, não só exibição):
   se a feature adicionar um campo selecionável cujo VALOR é comparado em código
   (como `contexto`/`frequencia`), use **slug estável** como valor + rótulo traduzido
   (padrão em `src/lib/onboarding-options.ts`). NÃO compare strings traduzidas em
   código. Campos que só a IA lê (texto livre) podem guardar o rótulo direto.

6. **Valide:** `npm run typecheck`. (Não rode `npm run build` com o dev server vivo —
   corrompe `.next`.)

## NÃO traduzir (gaps intencionais — não sinalizar)
- Painel `/admin` (interno, só o ADMIN_EMAIL).
- Mensagens de erro dinâmicas de algumas server actions (ex: validação) — voltam do
  servidor sem locale; aceitável, plumbar só se pedirem.
- Emails de magic-link/auth do **Supabase** (templados no painel, não por usuário).
- Logs (`console.*`), comentários, identificadores.

## Checklist final
- [ ] Nenhuma string nova voltada ao usuário hardcoded nos arquivos da tarefa.
- [ ] Chaves novas existem em pt **e** en **e** es.
- [ ] Interpolações usam `{var}` + `t(key, vars)`.
- [ ] Datas/números via `INTL_LOCALE[locale]`.
- [ ] Se mexeu em curadoria/email: idioma vem de `profile.idioma` e persona é nativa.
- [ ] Campo selecionável lido por código usa slug + rótulo traduzido.
- [ ] `npm run typecheck` passa.
