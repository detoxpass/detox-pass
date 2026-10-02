# Onboarding — Detox Pass

Bem-vindo(a) ao Detox Pass. Este guia ajuda qualquer desenvolvedor novo a entrar
no projeto do jeito certo. Siga os passos na ordem.

## 1. Leia o playbook

Leia o
[Playbook de Desenvolvimento do Detox Pass](./playbook/Detox_Pass_Playbook_Desenvolvimento_Azvor_PT_v1.2.pdf)
inteiro. Ele é a fonte de verdade sobre processo, Git, ambientes, segurança e
responsabilidades do time.

## 2. Leia o README

Leia o [`README.md`](../README.md) para entender o objetivo do produto, a stack
de referência e como o Bubble/Figma são usados (apenas como referência).

## 3. Entenda o workflow

Leia [`docs/DEVELOPMENT_WORKFLOW.md`](./DEVELOPMENT_WORKFLOW.md) e
[`CONTRIBUTING.md`](../CONTRIBUTING.md). Você precisa entender o fluxo
`Task → Branch → PR → CI → Review → Staging → QA → Produção` **antes** de
escrever qualquer código.

## 4. Instale as ferramentas necessárias

No mínimo você vai precisar de:

- **Git**
- **Node.js** (versão será confirmada no bootstrap técnico)
- **Cursor** (com o playbook anexado)

> As ferramentas e versões exatas (gerenciador de pacotes, CLI do Supabase,
> toolchain mobile, etc.) serão confirmadas quando o bootstrap técnico definir a
> stack. Esta seção será atualizada então.

## 5. Clone o repositório

```bash
git clone <URL-do-repositorio-detox-pass>
cd detox-pass
```

## 6. Configure as variáveis de ambiente

- Copie o arquivo de exemplo:

  ```bash
  cp .env.example .env
  ```

- Preencha o `.env` com valores de **teste/desenvolvimento**.
- Nunca use credenciais de produção em local.

## 7. Nunca compartilhe secrets

- O `.env` **não** é versionado (está no `.gitignore`). Só o `.env.example` é.
- Nunca cole API keys, `service_role`, chaves do Stripe, senhas, tokens ou dados
  reais de usuários em commits ou em prompts do Cursor.
- Se um segredo vazar, trate como comprometido e rotacione.

## 8. Crie uma branch antes de trabalhar

Nunca trabalhe direto na `main`. Para cada tarefa:

```bash
git checkout main
git pull origin main
git checkout -b feat/nome-da-tarefa
```

## 9. Use o Cursor seguindo as regras do projeto

- Anexe o playbook ao Cursor e use o cabeçalho padrão nos prompts.
- A IA ajuda a escrever código, mas **não aprova o próprio código**: tudo passa
  por revisão humana.
- Não deixe a IA refatorar partes não relacionadas à tarefa.
- Não exponha secrets nem invente capacidades de APIs externas.

## 10. Abra um PR ao terminar

- Faça push da sua branch e abra um Pull Request.
- Preencha o template de PR (o que, por quê, como testar, riscos, checklist).
- Aguarde CI e revisão. Áreas críticas precisam de revisão de Samuel ou Elias.
- Mudanças visíveis/booking/integração/pagamento precisam de QA humano do
  Anderson em staging.
