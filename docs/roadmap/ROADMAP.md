# Roadmap geral — Detox Pass

Data: 2026-10-05.

Este arquivo organiza o que falta para fechar a plataforma. A norma continua em
[`spec/`](../../spec/README.md) e em [`DECISIONS.md`](../DECISIONS.md). Este roadmap
não cria módulo, não escolhe política em aberto e não marca integração como
homologada.

Quando uma decisão pendente for aprovada por Samuel ou Elias, ela entra em
`docs/DECISIONS.md` antes de virar tarefa de implementação.

O corte das entregas 1 a 4, com a auditoria e os parâmetros de aceite, está em
[`ROADMAP-01-04.md`](./ROADMAP-01-04.md). A agenda interna e a escolha da
profissional estão em [`ROADMAP-AGENDA-INTERNA.md`](./ROADMAP-AGENDA-INTERNA.md).
A caixa de avisos e a página de favoritos estão em
[`ROADMAP-NOTIFICACOES.md`](./ROADMAP-NOTIFICACOES.md).
O agente de IA está em [`ROADMAP-AGENTE.md`](./ROADMAP-AGENTE.md).
O painel da operação está em [`ROADMAP-ADMIN.md`](./ROADMAP-ADMIN.md).
A Wix da ficha Detox Pass está em [`ROADMAP-WIX.md`](./ROADMAP-WIX.md).
O corte de Stripe, com o Gusto condicional, está em [`ROADMAP-STRIPE.md`](./ROADMAP-STRIPE.md).

## Como ler cada entrega

| Coluna | O que entra |
| ------ | ----------- |
| Frontend | Tela em `apps/web`. Lê e escreve só pela Data API ou pela Edge Function daquela porta. Não fala com Stripe, Acuity ou Gusto direto. |
| Backend | Migration, RLS, função SQL em `private` ou Edge Function. Segredo fica nos secrets da função, nunca no app nem no Git. |
| Automação | Cron, webhook, retry e fila. Sem pessoa clicando para o invariante se manter. |
| Aceite | O que precisa ser verdade para a entrega contar como pronta. |

Estados usados abaixo:

| Estado | Significado |
| ------ | ----------- |
| Publicado | A pessoa usa isso no app em produção. |
| No repositório | O código existe. O app publicado ainda não conduz esse fluxo. |
| Falta | Ainda não é superfície de produto. |
| Bloqueado | Depende de credencial, ambiente ou decisão que este arquivo não fecha. |

## Onde o produto está

Publicado no app (`apps/web`, Vercel, projeto Supabase `detoxpass`):

- Entrada com sessão real. O papel vem de `app_metadata`.
- Shell claro, sidebar recolhível no desktop, navbar inferior no mobile, título da página só no desktop.
- Catálogo autenticado: busca, cidade, serviço, faixa de preço real, ordenação, página da profissional com preço por serviço.
- Conta: nome, e-mail, foto, senha e página pública de apagar conta.
- Comissão inicial de 20% (2000 bps) em `marketplace_settings`, não espalhada no código.
- Preço cobrado, quando a cobrança existir, sai de `services.price_cents` e `services.currency`.

No repositório, ainda fora do fluxo do app:

- Saga da reserva, histórico, confirmação de atendimento e autorização de repasse em SQL.
- Ledger append-only, eventos de pagamento e retry de evento recebido e não lançado.
- Reward da regra `confirmed_session`, só depois da confirmação. A regra não libera payout.
- Edge Functions: `commands`, `chat` (só catálogo, sem modelo), `scheduling-acuity`, `stripe-charge`, `stripe-webhook`.
- Square, Wix, Zenoti e Mindbody respondem pendente. Gusto responde desligado.

Telas que o menu já nomeia e que hoje são área vazia: sessões, rewards, painel, agenda, pagamentos da profissional, e o menu da operação.

## O que este roadmap não fecha

Estes itens continuam pendentes. A implementação para na fronteira e deixa o buraco visível.

- Política de cancelamento, no-show e estorno: prazo, quem cancela, quanto volta.
- O que fazer quando o Stripe confirma e a agenda recusa, além da compensação já desenhada como passo explícito.
- Efeito de reagendar sobre um pagamento já confirmado.
- Prazo para a cliente confirmar, lembrete e expiração da fila.
- Se a operação pode confirmar no lugar da cliente. A norma atual é que não.
- Se a autorização do payout é automática, manual ou as duas.
- Prazo máximo de um payout pendente.
- Provedor e modelo de IA.
- Arquitetura definitiva dos objetos Stripe. Fecha depois da evidência da POC, numa decisão registrada.
- Estrutura final do Gusto. A fase só existe se a cliente do contrato optar.
- Biblioteca visual definitiva. Até lá valem os tokens de trabalho já no app.
- Ambiente de demonstração separado de produção, e em qual conta ele vive.
- Momento do handover de GitHub, Supabase e Vercel. Dono: Samuel.

Reviews, nota, milhas, filtro de gênero, bio inventada e horário desenhado na tela ficam de fora. O item Reviews do menu da operação veio do protótipo e não é um dos 12 módulos.

## Ordem

A ordem comercial continua a das nove fases em [`spec/12-fases.md`](../../spec/12-fases.md). O que já está publicado não reabre a fase. O que falta segue a dependência abaixo.

```
Base que ainda falta (router, staging, CI, URLs de auth, operador)
    → catálogo operável pela operação
    → POC Acuity autenticada
    → reserva no app
    → POC Stripe
    → confirmação, repasse, relatório e reward
    → Square, Wix, Zenoti, Mindbody, cada uma com teste autenticado
    → Gusto, só se a cliente optar
    → publicação, QA e garantia
```

O chat de catálogo pode entrar assim que a busca da cliente estiver estável. O modelo de IA espera a decisão do provedor. Capacitor espera o router e as rotas estáveis.

## Mapa dos 12 módulos

| Módulo | Estado | Próxima entrega |
| ------ | ------ | --------------- |
| 01 Painel | Falta | Entrada de cada perfil com o que aquele perfil pode abrir. Sem KPI inventado. |
| 02 Reservas | SQL no repositório | Tela de horário real, criar, cancelar, reagendar e histórico. |
| 03 Confirmações | SQL no repositório | Fila da cliente. A confirmação não libera payout. |
| 04 Pagamentos | Função no repositório, sem chave Stripe | Cobrança da reserva pelo preço do catálogo. |
| 05 Repasses | SQL no repositório | Autorização só da operação, depois da confirmação. |
| 06 Profissionais | Leitura publicada | Cadastro e ativação pela operação. |
| 07 Agenda da profissional | Vínculo no schema | Conexão com a agenda de origem. Sem grade local. |
| 08 Integrações | Acuity escrita; as outras pendentes | POC autenticada antes de qualquer status de homologada. |
| 09 Clientes | Conta publicada | Histórico de reserva, reagendamento, cancelamento e confirmação. |
| 10 Relatórios e Administração | SQL de relatório no repositório | Pago, pendente e liberado, e comissão em bps. |
| 11 Rewards | Regra `confirmed_session` no banco | Leitura da própria profissional e configuração pela operação. |
| 12 Chat | Função de catálogo no repositório | Tela de descoberta. Sem modelo até a decisão. |

---

## 1 — Base que ainda falta

A Fase 01 já tem os três perfis, o schema e o app publicado. Estes itens ainda impedem tratar a base como fechada.

### 1.1 Rotas estáveis

| | |
| --- | --- |
| Frontend | Router. Cada destino do shell e a página pública `/delete-account` têm URL. Recarregar abre a mesma tela. Estado de sessão separado do estado de tela. |
| Backend | Nada de regra nova. |
| Automação | Nenhuma. |
| Aceite | Recarregar `/` logado volta na área daquele perfil. Recarregar a página da profissional mantém a profissional. Sair da conta não deixa a rota autenticada aberta. |

### 1.2 Ambiente de demonstração

| | |
| --- | --- |
| Frontend | O app de demonstração aponta para o projeto Supabase de demonstração. Produção não é o lugar do teste de agenda nem de Stripe. |
| Backend | Segundo projeto, com as mesmas migrations. Seed de demonstração sem segredo. |
| Automação | CI aplica a checagem no ambiente de demonstração antes de promover. |
| Aceite | Staging e produção são projetos diferentes. Uma credencial de teste não abre a produção. |

Bloqueado até Samuel definir a conta que hospeda o segundo projeto. Não comprar ambiente novo sem orçamento e aprovação.

### 1.3 CI e revisão

| | |
| --- | --- |
| Frontend | `typecheck` e build de `apps/web` no CI. |
| Backend | Migrations e testes de invariante do banco no CI, quando o ambiente de teste existir. |
| Automação | PR obrigatório na `main`. Pagamento, auth, RLS, migration e produção com revisão de Samuel ou Elias. |
| Aceite | A `main` não recebe push direto. O CI falha se o typecheck ou o build falhar. |

### 1.4 Auth e primeiro operador

| | |
| --- | --- |
| Frontend | Cadastro e recuperação de senha, se forem abertos, mostram o erro real. O link de confirmação abre o app publicado, não `localhost`. |
| Backend | `site_url` e URLs de redirect do Auth apontam para o app publicado. O primeiro operador continua sendo `snippets/promote-operator.sql`, com o e-mail real, fora das migrations. |
| Automação | Nenhuma. |
| Aceite | Um e-mail de confirmação ou recuperação abre o domínio publicado. Existe uma conta de operação promovida por esse snippet. O papel não é editável na página de conta. |

---

## 2 — Catálogo operável

A cliente já encontra profissional ativa por serviço e cidade. A operação ainda não administra esse catálogo pela tela.

| | |
| --- | --- |
| Frontend | Para a operação: profissionais, serviços, cidades, preço e moeda juntos, foto, ativo ou inativo. A profissional não edita o próprio preço. A página de conta continua só com foto, nome, e-mail, senha e apagar conta. |
| Backend | Escrita do catálogo restrita à operação, com RLS. Preço sem moeda, ou moeda sem preço, não grava. Profissional inativa some da descoberta. |
| Automação | Nenhuma nesta entrega. |
| Aceite | A operação altera o preço de um serviço e a home da cliente passa a mostrar esse preço. A cliente não envia valor. Busca vazia não inventa profissional. Especialidade só aparece se a operação tiver gravado especialidade de verdade. |

---

## 3 — POC Acuity

Nenhuma agenda está homologada. A função `scheduling-acuity` já cobre disponibilidade, criar, reagendar, cancelar e gravar token. Falta a evidência autenticada.

| | |
| --- | --- |
| Frontend | A operação grava a conexão da profissional (provedor Acuity e o recurso externo). A cliente, na página da profissional, pede os horários de um dia. Sem conexão ou sem token, a tela diz que a disponibilidade não veio da agenda. |
| Backend | Token da agenda no Vault, gravado só pela operação. A função registra a resposta real da API. Status da conexão só sobe depois do teste. |
| Automação | Nenhuma além da chamada autenticada. Não há cron que invente horário. |
| Aceite | Com credencial de teste: consultar disponibilidade, criar, reagendar e cancelar, e guardar as respostas. Sem credencial, a função responde pendente. Mock, documentação ou chamada sem autenticação não contam. |

Bloqueado até existir credencial de teste da Acuity. A tela não desenha grade local para preencher essa espera.

---

## 4 — Reservas na plataforma

Depende da POC Acuity. A saga SQL (`open_booking_intent`, provedor confirmado, cancelar, reagendar) já está no repositório.

| | |
| --- | --- |
| Frontend | A cliente escolhe serviço, horário devolvido pela agenda e confirma a intenção. A lista Minhas sessões mostra o histórico real: criada, reagendada, cancelada. Intenção confirmada não aparece como paga. |
| Backend | A tela chama a porta de comando. A função revalida o horário antes de confirmar no provedor. Cancelar e reagendar atualizam o provedor. Se o provedor não suportar a operação, o estado fica explícito como não suportado. |
| Automação | A saga registra o passo em que agenda e pagamento divergem. Compensação é um passo nomeado, não um booleano na tela. |
| Aceite | O horário exibido existia na agenda de origem. A reserva não é marcada paga neste passo. Cancelar na plataforma cancela no provedor, ou declara que o provedor não suportou. A profissional não confirma a própria reserva no lugar da cliente. |

Política de prazo, multa e estorno continua em aberto. Até a decisão, cancelar executa o que a agenda permitir e não inventa quanto dinheiro volta.

---

## 5 — POC Stripe

O aceite e o relatório desta prova estão em [`ROADMAP-STRIPE.md`](./ROADMAP-STRIPE.md). `stripe-charge` e `stripe-webhook` existem. Sem `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`, os dois respondem indisponível. A arquitetura dos objetos Connect continua em aberto até esta POC produzir evidência.

| | |
| --- | --- |
| Frontend | Na reserva já confirmada no provedor, a cliente inicia o pagamento. Sem a chave, a tela diz que a cobrança não está disponível. Não há pagamento aprovado de mentira. O valor mostrado é o do serviço. |
| Backend | A cobrança lê `price_cents` e `currency` no servidor e recusa outro valor. Serviço sem preço não abre checkout. O webhook, com assinatura válida, grava o evento e aplica pago e payout pendente na mesma função SQL. Comissão lida de `marketplace_settings`. |
| Automação | Caixa de eventos idempotente. Cron, ou o retry já existente, reaplica evento recebido e ainda não lançado. |
| Aceite | Em modo de teste: cobrança confirmada, comissão separada, payout pendente, profissional sem ação de se pagar. Rodar o mesmo webhook duas vezes não lança duas vezes. A decisão dos objetos Stripe (destination charge, transfer ou outro) só é escrita depois dessa evidência. |

---

## 6 — Confirmação, repasse, relatório e reward

Depende da reserva paga. SQL de confirmar, autorizar e relatório já está no repositório. A concessão de reward da regra `confirmed_session` também.

| | |
| --- | --- |
| Frontend | A cliente vê a fila do que já foi atendido e ainda não confirmou. Confirmar não mostra o repasse como liberado. A operação vê pago, pendente e liberado, edita a comissão em bps e autoriza o repasse só depois da confirmação. A profissional vê o extrato da própria atuação, sem botão de liberar. Rewards da profissional listam só sessão confirmada. |
| Backend | `confirm_attendance` só para a cliente daquela reserva. `authorize_payout` só para operação, e só com confirmação. Reward não escreve no ledger e não muda payout de pendente para liberado. |
| Automação | Se a decisão futura for autorização automática, ela entra como regra no servidor, não como clique escondido na tela da profissional. Lembrete e expiração da fila esperam o prazo aprovado. Até lá, não há lembrete inventado. |
| Aceite | Uma reserva paga percorre pendente, confirmação da cliente e liberação. O relatório mostra os três termos e bate com o ledger. Cancelada não confirma e não pontua. Paga e não confirmada não pontua. A profissional não autoriza o próprio repasse. |

Bônus em dinheiro, selo, destaque e redução de comissão futura continuam fora até a operação aprovar a fórmula. A única regra ativa hoje é a elegibilidade `confirmed_session`.

---

## 7 — Demais agendas

Ordem fixa, depois da Acuity com evidência: Square, Wix, Zenoti, Mindbody. Cada função hoje responde pendente de propósito.

| Provedor | Frente | Aceite para deixar de ser pendente |
| -------- | ------ | ---------------------------------- |
| Square | Escrita depende de plano e permissão. | Teste autenticado de disponibilidade, criar, reagendar e cancelar, ou registro do que o plano não permite. |
| Wix | Criar e confirmar podem ser etapas separadas. O plano da ficha Detox Pass está em [`ROADMAP-WIX.md`](./ROADMAP-WIX.md). | Teste autenticado que mostra as duas etapas, se a API as separar. |
| Zenoti | Cancelamento depende da invoice. | Teste autenticado que inclui o cancelamento real, ou o marca como não suportado. |
| Mindbody | Produção depende de onboarding do fornecedor. | Teste autenticado e, para produção, o onboarding. Sem isso, permanece pendente. |

Frontend e backend de cada uma reusam a mesma porta da reserva. A tela não ganha um cliente HTTP do provedor. Nenhuma das cinco é anunciada como homologada porque o adapter compila.

A prova de 2026-10-06, na ficha Detox Pass, está em [`ROADMAP-AGENDAS.md`](./ROADMAP-AGENDAS.md). A Square dessa prova ficou `tested`. A Wix da mesma ficha fechou o ciclo em [`ROADMAP-WIX.md`](./ROADMAP-WIX.md) e ficou `tested`, sem virar origem.

---

## 8 — Chat

O corte do agente, com ferramentas, áudio, blocos visuais e a lista de testes, está em [`ROADMAP-AGENTE.md`](./ROADMAP-AGENTE.md).

---

## 9 — Painéis

O menu já separa cliente, profissional e operação. O miolo desses destinos ainda é a área vazia, fora catálogo e conta.

| Perfil | Frontend | Não entra |
| ------ | -------- | --------- |
| Cliente | Atalhos para busca, sessões e rewards, com estado vazio honesto. | Número de negócio sem fonte no banco. |
| Profissional | Atalhos para agenda, extrato e rewards. Agenda sem conexão aparece como pendente. | Liberar repasse. Grade de horários local. |
| Operação | Atalhos para profissionais, reservas, financeiro, usuários, comissão e regras de reward. | Reviews. KPI de protótipo. Docs como módulo. |

Aceite: cada perfil abre só a própria lista. Trocar de conta troca a lista e não o chrome. O alvo de toque da navegação continua de no mínimo 44px.

---

## 10 — Gusto

Fase condicional. O portão está no corte 4 de [`ROADMAP-STRIPE.md`](./ROADMAP-STRIPE.md). A função já responde desligada.

| | |
| --- | --- |
| Frontend | Nada no checkout. Se a cliente optar, a operação vê o pagamento de contractor depois da confirmação. |
| Backend | Continua fora do Stripe. Não faz split da cobrança. |
| Automação | Só depois da estrutura aprovada. |
| Aceite | Sem opt-in registrado, a fase fica dispensada por escrito. Com opt-in, W-9 e 1099 seguem com a cliente e o contador. |

---

## 11 — Capacitor

Depende das rotas estáveis.

| | |
| --- | --- |
| Frontend | Projetos iOS e Android apontam para o build de `apps/web`. O mesmo shell das três faixas. Safe area não cobre conteúdo. Voltar no Android não fecha o app no primeiro passo interno se houver histórico. |
| Backend | As mesmas portas. Sem segunda API. |
| Automação | Pipeline de build quando a loja for decisão. Loja e assinatura ficam fora até decisão própria. |
| Aceite | Um aparelho com gesto de home mostra a navbar sem cobrir o conteúdo. Não há layout nativo paralelo. |

---

## 12 — Publicação e garantia

O app web já está publicado. Esta fase fecha a homologação, não substitui os portões anteriores.

| | |
| --- | --- |
| Frontend | Produção sai da `main` depois do staging. |
| Backend | Migrations da `main` são as aplicadas em produção. Segredos de produção conferidos fora do Git. |
| Automação | O retry de pagamento está agendado no ambiente que tiver `pg_cron`, ou documentado o agendador externo que chama `retry_unapplied_payment_events`. |
| Aceite | Anderson fez QA em staging dos fluxos de reserva, agenda, pagamento e repasse. O handover de contas espera o procedimento de Samuel. A garantia corrige no mesmo repositório e não abre módulo novo. |

## Critério de fim

As entregas 1 a 7, 9 e 12 estão aceitas. A entrega 8 está aceita na parte de catálogo, e a parte de modelo está aceita ou segue explícita como sem provedor. A entrega 10 está entregue ou dispensada por escrito. A entrega 11 entra no fim do desenvolvimento se o empacotamento mobile fizer parte do corte; a loja continua decisão à parte.

Item em aberto que muda comportamento ou foi decidido e registrado, ou permanece visível como limitação. Não é preenchido em silêncio no código.
