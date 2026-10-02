# Registro de decisões técnicas — Detox Pass

Este arquivo é um registro simples das decisões técnicas do projeto (um
"ADR light"). Cada decisão usa o formato abaixo. Registre aqui **apenas decisões
já tomadas**, não ideias em discussão.

Formato:

```
## YYYY-MM-DD — Nome da decisão

Contexto:
...

Decisão:
...

Motivo:
...

Impacto:
...

Responsável:
...
```

---

As decisões abaixo já estão definidas no Playbook de Desenvolvimento do Detox
Pass (v1.2).

## 2026-10-02 — Stack de frontend: React + TypeScript

Contexto: o produto está sendo reconstruído em high-code a partir da versão
Bubble.

Decisão: usar React + TypeScript como base do frontend.

Motivo: stack moderna, tipada e bem suportada, adequada a um produto web/mobile
de médio porte.

Impacto: define a linguagem e o ecossistema de todo o frontend. Detalhes de
build e versões serão confirmados no bootstrap técnico.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — Mobile com Capacitor (Android e iOS)

Contexto: o produto precisa rodar em Android e iOS reaproveitando a base web.

Decisão: usar Capacitor para empacotar o app para Android e iOS.

Motivo: permite reutilizar o frontend React em mobile sem manter duas bases
nativas separadas.

Impacto: o código precisa considerar compatibilidade com Capacitor; builds
mobile entram no mesmo repositório.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — Repositório único

Contexto: o time é pequeno e precisa de contexto compartilhado.

Decisão: começar com um único repositório contendo app React, Supabase,
projetos Capacitor, testes, scripts e documentação. Monorepo (apps/pacotes) só
será adotado se trouxer benefício real e isso for registrado antes do
desenvolvimento paralelo.

Motivo: simplifica o trabalho do time e ajuda o Cursor a enxergar o contexto
inteiro.

Impacto: toda a estrutura inicial vive em um repo. Uma eventual migração para
monorepo exige nova decisão registrada.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — Branches curtas por tarefa

Contexto: queremos velocidade sem virar bagunça nem gerar conflitos.

Decisão: usar branches curtas por tarefa (`feat/`, `fix/`, `chore/`, `docs/`,
`refactor/`, `hotfix/`), criadas a partir da `main` atualizada. Sem branches
permanentes por módulo.

Motivo: reduz conflitos e o problema de "na minha branch funcionava".

Impacto: módulos grandes são construídos por várias tarefas pequenas que entram
continuamente na `main`.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — Main protegida e Pull Request obrigatório

Contexto: a `main` precisa ser a fonte estável e pronta para deploy.

Decisão: `main` protegida; ninguém faz push direto; toda mudança entra por Pull
Request com revisão. Áreas de alto risco (pagamentos, auth, RLS, migrations,
secrets, produção) exigem revisão de Samuel ou Elias.

Motivo: cria um ponto claro de revisão e protege o projeto sem burocracia
excessiva.

Impacto: o merge na `main` depende de PR + revisão + CI.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — IA como ferramenta de desenvolvimento (sem autoaprovação)

Contexto: o time usa Cursor/IA para acelerar o desenvolvimento.

Decisão: a IA pode escrever código, mas o código gerado por IA segue o mesmo
processo de revisão e teste de código humano. A IA não aprova o próprio código.

Motivo: velocidade de geração não substitui critério, revisão e
responsabilidade técnica.

Impacto: todo código de IA passa por revisão humana antes do merge.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — Bubble e Figma como referência, não como fonte absoluta

Contexto: já existe uma versão em Bubble e telas no Figma, com identidade visual
antiga.

Decisão: usar Bubble (funcional/histórico) e Figma (UX/fluxos) apenas como
referência. A nova versão terá identidade visual própria; não copiar o visual
antigo sem validação.

Motivo: a marca/visual mudou desde que esses materiais foram feitos.

Impacto: em conflito, vale a decisão mais recente aprovada por Samuel/Elias e a
nova identidade visual.

Responsável: Samuel / Elias (playbook).

## 2026-10-02 — QA humano liderado por Anderson em staging

Contexto: testes automatizados não garantem que o produto funciona para uma
pessoa real.

Decisão: Anderson é o responsável principal pelo QA humano/funcional, feito em
staging, antes do aceite de features que alteram comportamento visível, booking,
integração ou fluxo de negócio. Produção nunca é usada como primeiro lugar de
teste.

Motivo: garante que a experiência real do usuário seja validada por uma pessoa.

Impacto: PRs de fluxo crítico precisam de evidência de QA humano antes do aceite.

Responsável: Samuel / Elias (playbook); execução por Anderson.
