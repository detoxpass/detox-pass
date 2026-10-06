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

As decisões abaixo estão definidas no **Playbook de Desenvolvimento do Detox
Pass (v1.2)** e na **Proposta Comercial Final** aprovada.

## 2026-10-02 — Hierarquia de fontes de verdade

Contexto: o projeto tem várias referências (proposta, playbook, Bubble, Figma) e
é preciso evitar que referências antigas justifiquem decisões fora do escopo.

Decisão: adotar a seguinte hierarquia de fontes de verdade:
- **Proposta Comercial Final** → define o escopo comercial e funcional (o que foi
  vendido e faz parte do produto).
- **Playbook** → define o processo de engenharia (como o time desenvolve).
- **Nova identidade visual** → prevalece sobre Bubble e Figma no visual.
- **Bubble** → referência funcional e histórica.
- **Figma** → referência de UX, fluxos e telas.
- Decisões posteriores documentadas e aprovadas por Samuel/Elias prevalecem sobre
  as referências antigas.

Motivo: Bubble e Figma têm identidade antiga e não refletem necessariamente o
escopo vendido. Nunca usar Bubble/Figma como justificativa automática para
implementar algo fora da proposta.

Impacto: em conflito, vale a proposta + decisão mais recente aprovada. Ver
[`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md).

Responsável: Samuel / Elias.

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

Decisão: para esta fase do Detox Pass, usar **um único repositório** com
**estrutura simples**, contendo app React, Supabase, projetos Capacitor, testes,
scripts e documentação. **Sem monorepo**, **sem branch `develop` permanente**,
com **branches curtas por tarefa** e **`main` protegida**. Monorepo só será
adotado se trouxer benefício técnico real e isso for registrado antes do
desenvolvimento paralelo.

Motivo: simplifica o trabalho do time, mantém segurança com baixa burocracia e
ajuda o Cursor a enxergar o contexto inteiro.

Impacto: toda a estrutura inicial vive em um repo. Uma eventual migração para
monorepo exige nova decisão registrada aqui.

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

## 2026-10-02 — Cronograma: 6 meses (3 de desenvolvimento + 3 de garantia)

Contexto: a Proposta Comercial Final define prazos e organização do trabalho.

Decisão: contrato total de 6 meses — **3 meses de desenvolvimento** e **3 meses
de garantia**. O desenvolvimento é organizado em **9 fases** (ver
[`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md)). Durante a garantia, correções são
publicadas no mesmo repositório.

Motivo: alinhar expectativa de entrega e suporte ao que foi vendido.

Impacto: o planejamento de tarefas deve respeitar a ordem das fases.

Responsável: Samuel (produto/governança).

## 2026-10-02 — 12 módulos oficiais do produto

Contexto: a proposta define o conjunto de módulos do produto.

Decisão: os módulos oficiais são Painel, Reservas, Confirmações, Pagamentos,
Repasses, Profissionais, Agenda da profissional, Integrações, Clientes,
Relatórios e Administração, Rewards e Chat com agente de IA. Não criar novos
módulos oficiais sem decisão posterior aprovada.

Motivo: delimitar o escopo e evitar expansão não vendida.

Impacto: funcionalidades fora desses módulos precisam de nova decisão.

Responsável: Samuel / Elias.

## 2026-10-02 — Pagamento com liberação condicionada e comissão configurável (20%)

Contexto: o produto é um marketplace; a cliente paga na reserva e o repasse à
profissional só acontece após a confirmação do atendimento.

Decisão: adotar **pagamento com liberação condicionada** (*conditional payment
release / delayed payout*) via Stripe/Stripe Connect. A profissional **não** pode
liberar o próprio payout. **Não** usar a expressão "escrow account".

Comissão do marketplace:
- **Regra inicial = 20%.**
- **Implementação = parametrizável** — configuração do sistema, **nunca** um valor
  hardcoded espalhado pelo código.

Motivo: proteger a cliente e garantir que o repasse só ocorra após a confirmação,
com comissão ajustável pela operação.

Impacto: a arquitetura financeira **definitiva** só é fechada após a POC de Stripe
Connect (Fase 05). Área de alto risco: revisão obrigatória de Samuel ou Elias.

Responsável: Samuel / Elias.

## 2026-10-02 — Rewards vinculados a atendimento confirmado

Contexto: recompensas não podem incentivar sessões não realizadas.

Decisão: rewards são vinculados a **atendimentos confirmados**; sessão cancelada
ou sem confirmação não pontua. Rewards não substituem comissão, não liberam
payout e não substituem o Stripe.

Motivo: manter a integridade financeira e evitar pontuação indevida.

Impacto: a lógica de rewards depende da confirmação (Fase 06).

Responsável: Samuel / Elias.

## 2026-10-02 — Chat com agente de IA faz parte do escopo

Contexto: a proposta inclui um agente de IA para ajudar a cliente a encontrar
serviço, cidade e profissional.

Decisão: o chat com agente de IA é um módulo oficial. Ele usa apenas dados da
plataforma e **não** inventa horários, não cobra, não libera payout, não decide
pela cliente, não dá orientação clínica e não chama integração não testada de
"homologada". Após a conversa, o fluxo segue para perfil → disponibilidade real →
booking → Stripe.

Motivo: oferecer descoberta assistida sem assumir responsabilidades que são de
outras partes do sistema.

Impacto: o provedor/modelo de IA é **decisão pendente** (ver abaixo).

Responsável: Samuel / Elias.

## 2026-10-02 — Ambiente de demonstração separado de produção

Contexto: a proposta exige um ambiente de demonstração/homologação separado de
produção.

Decisão: manter **Local**, **Staging/Demonstração** e **Production** como
ambientes distintos. Nunca usar produção para desenvolvimento ou testes comuns.

Motivo: evitar que a produção vire laboratório e proteger dados reais.

Impacto: o bootstrap técnico precisa prever o ambiente de demonstração.

Responsável: Samuel / Elias.

## 2026-10-02 — Acuity é a primeira POC autenticada de agenda

Contexto: a Proposta Comercial Final já determinou a ordem inicial das POCs de
agenda: 1) Acuity, 2) Square, 3) Wix, 4) Zenoti, 5) Mindbody.

Decisão: **Acuity Scheduling será a primeira POC autenticada de agenda**. A ordem
acima é a referência para as integrações seguintes (ver
[`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md), Fases 03 e 07).

Motivo: a ordem já está definida comercialmente; não é uma escolha técnica em
aberto.

Impacto: **nenhuma integração** (incluindo Acuity) pode ser chamada de
**homologada** antes do teste autenticado.

Responsável: Samuel / Elias.

## 2026-10-02 — Propriedade dos ativos é da Detox Pass/cliente

Contexto: a Proposta Comercial Final já define a quem pertencem os ativos ao
final do projeto.

Decisão: ao final, **GitHub, Supabase e Vercel** ficam nas contas da Detox Pass,
e **código, banco e histórico** pertencem à cliente. Domínio/produção não ficam
retidos pela Azvor. Isso **não** é uma questão em aberto.

Motivo: alinhar a documentação ao que foi contratado.

Impacto: o que permanece em aberto é apenas o **momento e o procedimento de
transferência** dos ambientes criados hoje pela Azvor (ver seção de handover
abaixo).

Responsável: Samuel.

---

## 2026-10-05 — Três portas no Supabase

Contexto: o app é Vite + Capacitor, sem servidor Node próprio. Pagamento,
agenda e chat precisam de segredo e de invariante transacional. A spec de
produto já exigia RLS, `service_role` só no servidor e webhook idempotente, e
deixava o desenho em aberto.

Decisão: usar o Supabase em três portas, como norma em
[`spec/15-supabase.md`](../spec/15-supabase.md).

- Data API com RLS para leitura e edição do próprio usuário, sem efeito financeiro.
- Funções SQL no schema `private` para invariantes (pago e pendente juntos, repasse único, reward após confirmação).
- Uma Edge Function por sistema externo (agenda, Stripe, chat, Gusto), com código comum em `_shared`. A função faz entrada e saída e chama uma função SQL. Ela não encadeia updates soltos.
- Papel dos três perfis em `app_metadata`, nunca em `user_metadata`.
- Ledger append-only. `authenticated` não escreve tabela financeira, nem a operação.
- Agenda e Stripe formam uma saga. O webhook é o marco do pago. Compensação é passo explícito. Trigger SQL não chama HTTP.
- Segredo de plataforma nos secrets da Edge Function. Token de agenda por profissional no Vault ou em tabela `private`.
- Cron de reconciliação de evento recebido e não aplicado entra na POC da Fase 05.
- Realtime, Storage, Vectors, Queues e Foreign Data Wrapper do Stripe ficam fora da fundação.

Motivo: concentrar a regra que não pode falhar pela metade no Postgres e isolar
segredo e HTTP na borda, sem abrir um segundo backend.

Impacto: a fundação (Fase 01) cria os schemas, o papel e a RLS nesse formato. A
Fase 05 ainda precisa fechar os objetos do Stripe. Provedor de IA, texto final
de cada policy e nomes físicos de tabela continuam para o bootstrap.

Responsável: Elias.

---

## 2026-10-05 — Preço cobrado sai do catálogo

Contexto: a sessão de checkout aceitava `amount_cents` e `currency` enviados
pela cliente. Isso permitia cobrar um valor diferente do serviço.

Decisão: a operação grava preço e moeda no serviço. A cobrança lê esse par no
servidor e a função SQL recusa qualquer valor diferente. Serviço sem preço não
abre checkout.

Motivo: o valor pago precisa ser o valor configurado pela operação, não o que
o aplicativo escolhe.

Impacto: `public.services` ganha `price_cents` e `currency`. Stripe Connect
continua em aberto. A moeda padrão do marketplace continua opcional.

Responsável: Elias.

---

## 2026-10-05 — Comunicação Detox Pass e shell do app

Contexto: o protótipo de referência ainda falava "Brazilian Beauty Formula" e
"BBF", e a navegação era uma barra no topo. O app precisa servir web e, depois,
Capacitor no Android e no iOS.

Decisão: nenhuma tela, código de exemplo nem nome de conta usa "Brazilian
Beauty", "BBF" ou o wordmark desse protótipo. A navegação principal é uma
sidebar no tablet e no desktop. No mobile essa sidebar vira a navbar inferior.
O header fica em todos os tamanhos, com a conta e os atalhos. O mapa, os
critérios de aceite e a estrutura de pastas estão em `spec/17-frontend.md`.

Motivo: a marca do produto é Detox Pass, e o mesmo shell precisa caber num
webview nativo sem depender do chrome do navegador.

Impacto: o protótipo continua como referência de fluxo. Ele não define mais a
comunicação nem o chrome. A biblioteca visual definitiva segue em aberto.

Responsável: Elias.

---

# Decisões pendentes

> Itens ainda **não definidos**. Não implementar/escolher sem aprovação de
> Samuel/Elias. Ao definir, mover para o histórico de decisões acima.

- [ ] **Modelo e provedor de IA** do agente de chat.
- [ ] **Biblioteca visual / design system definitivo** e nova identidade visual aprovada.
- [ ] **Arquitetura definitiva do Stripe / payout** (só fecha após a POC da Fase 05).
- [ ] **Estrutura final do Gusto** (Fase 08, opcional) e tratamento fiscal (W-9/1099) com a cliente/contador.
- [ ] **Ferramenta de build/dev** (ex.: Vite) e versões de React/TypeScript/Node.
- [ ] **Qual conta hospeda cada projeto Supabase e o deploy Vercel** de cada ambiente. O padrão de três projetos, de segredos e de acesso já está decidido acima.
- [ ] **Texto SQL de cada policy** e nomes físicos de tabela. O modelo (papel em `app_metadata`, RLS, escrita financeira só por função) já está decidido.

> A **estrutura de repositório** não é pendência: a decisão desta fase é
> **repositório único, estrutura simples, sem monorepo, sem branch `develop`
> permanente, branches curtas por tarefa e `main` protegida** (ver decisão
> "Repositório único" acima). Monorepo só será reavaliado se surgir necessidade
> técnica real, com registro aqui.

---

## 2026-10-05 — A profissional escolhe agenda interna ou externa

Contexto: a spec tratava horário digitado na plataforma como calendário interno
inventado e exigia agenda de origem externa. Elias pediu que cada profissional
tenha agenda individual, sem compartilhar login, e que quem não usa Acuity,
Square, Wix, Zenoti ou Mindbody possa atender pela agenda da própria plataforma.

Decisão: a profissional escolhe **interna** ou **externa**. A escolha aparece
num modal até ela definir o modo ou pedir para não mostrar de novo. A agenda
interna é a grade que ela publica (janelas semanais, duração do horário, fuso
e bloqueios). A cliente só reserva um instante que essa grade devolveu. Dois
pedidos no mesmo intervalo não criam duas reservas. A agenda externa continua
com um token por profissional, no Vault, no provedor daquela ficha. Login e
senha da Acuity não são compartilhados.

Motivo: a profissional que não tem conta externa precisa receber a reserva na
própria agenda, e a que tem conta externa continua recebendo o evento na conta
dela.

Impacto: profissional sem modo definido não oferece horário. A interna não é
fallback da Acuity fora do ar. Preço, pagamento, estorno e repasse não mudam.

Responsável: Elias.

---

## 2026-10-05 — O cadastro de parceiro cria profissional

Contexto: o sign-up da página de entrada cria cliente. Elias pediu uma landing
de parceiros em que o cadastro já nasce profissional, sem confirmação de e-mail,
com os dados que o perfil da profissional pede no protótipo.

Decisão: a página `/partners` cria a conta com papel `profissional` em
`app_metadata`. A ficha nasce inativa e fora da busca da cliente. A confirmação
de e-mail do projeto de produção fica desligada. O formulário pede nome, e-mail,
nascimento, gênero opcional, telefone, bio, senha, endereço, cidade, estado,
CEP, Instagram, especialidade e área de cobertura, mais o aceite dos termos.
Preço, certificado e portfólio não entram neste cadastro: o preço continua com
a operação, e não há módulo de análise de documento para receber arquivo.

Motivo: parceiro e cliente não podem nascer do mesmo papel. A profissional só
aparece para a cliente depois que a operação aprovar a ficha.

Impacto: o sign-up em `/` continua criando cliente. A landing não publica a
profissional e não grava valor de serviço.

Responsável: Elias.

---

## 2026-10-05 — A prova desta fase é o app publicado

Contexto: não existe ambiente local de aceite nem staging. O relatório que citava
Docker, `supabase start` ou `http://127.0.0.1:5173` não vale como prova.

Decisão: a prova de uma entrega é esta sequência, no projeto `detoxpass`
(`otddminugslmacdirual`) e no app `https://detox-pass.vercel.app`:

1. Commit e push em `detoxpass/main`.
2. `supabase db push --linked` quando houver migration.
3. `supabase functions deploy` da função alterada.
4. Exercitar o fluxo no app publicado, já com esse commit no ar.

`config.toml` continua com `site_url` local e não é copiado para produção.

Motivo: Elias pediu que o teste aconteça no ambiente que o cliente abre, não
num stack local.

Impacto: o workflow, o guia de contribuição e o checklist de PR seguem esta
prova. O job de banco do CI não sobe um Postgres local. Pagamento, estorno e
repasse continuam fora até existir provedor de cobrança.

Responsável: Elias.

---

# Pendência de transferência / handover

> A **propriedade** dos ativos já está decidida (pertence à Detox Pass/cliente —
> ver decisão acima). O que precisa de decisão de **Samuel** é apenas o **momento
> e o procedimento de transferência/migração** dos ambientes criados hoje pela
> Azvor. **Não mover nada agora.**

O repositório atual está em **`azvor-team/detox-pass`**. Essa localização é
**operacional/temporária** até Samuel definir o momento do handover. A fazer:

- [ ] Definir o **momento e o procedimento** de transferência/migração do
      **repositório GitHub** para a conta da Detox Pass.
- [ ] Definir o mesmo para **Supabase** e **Vercel** **antes de produção**.
- [ ] Garantir que, durante a garantia, as correções continuem no mesmo
      repositório da cliente.

Responsável: Samuel.
