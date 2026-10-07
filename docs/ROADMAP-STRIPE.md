# Stripe

Data: 2026-10-07. Este corte segue a Fase 05 e, só depois da evidência, a
liberação da Fase 06. O Gusto permanece a Fase 08 e só existe se a cliente
do contrato optar. A norma continua em [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md),
[`DECISIONS.md`](./DECISIONS.md) e na seção 5 de [`ROADMAP.md`](./ROADMAP.md).

Este arquivo não escolhe o objeto Connect, não marca a Stripe como
homologada e não liga o Gusto. Pagamento com liberação condicionada. A
expressão usada no produto é essa. A profissional não libera o próprio
repasse. A comissão sai de `marketplace_settings` (inicial 2000 bps). O app
não chama a Stripe nem o Gusto. Quem chama é a Edge Function, e o efeito
financeiro entra por função SQL.

A prova deste corte não roda no projeto de produção `detoxpass`
(`otddminugslmacdirual`). Produção não recebe chave de teste nem cobrança
de ensaio. Enquanto o projeto de demonstração não existir, a tabela de
resultado fica em "Ainda não rodou".

## Direcionamento

```
1. Chaves de teste e webhook no projeto de demonstração
    → 2. Aceite da cobrança: sessão, webhook, ledger, idempotência
    → 3. Prova Connect em teste; a decisão do objeto entra em DECISIONS.md depois
    → 4. authorize_payout move dinheiro, depois da confirmação da cliente
    → 5. Gusto, só com opt-in escrito, como pagamento separado
```

O passo 3 não começa antes do passo 2. O passo 4 não começa antes do
registro em `DECISIONS.md`. O passo 5 não começa sem o opt-in.

## O que já está no repositório

Isto é leitura do código, não resultado de prova.

| Peça | O que faz hoje |
| --- | --- |
| `stripe-charge` | Checkout Session da reserva `provider_confirmed`, da própria cliente. Valor lido de `services.price_cents` e `currency`. Sem `STRIPE_SECRET_KEY`, 503. |
| `stripe-webhook` | Assinatura, `checkout.session.completed` e `charge.refunded`. Sem `STRIPE_WEBHOOK_SECRET`, 503. Assinatura inválida, 400. |
| `apply_payment_event` | No pago, grava `charge_confirmed`, `commission` e `payout_pending`. O mesmo evento já aplicado não lança de novo. |
| `authorize_payout` | Só operação, e só com confirmação da cliente. Grava `payout_released` no ledger. Não chama a Stripe. |
| `gusto` | 501 `optional_not_enabled` enquanto `GUSTO_ENABLED` não for `true`. Com a flag, 501 `pending`. Não faz split. |

A sessão de hoje cai inteira na conta da plataforma. Não há
`application_fee`, `transfer_data` nem conta conectada.

Segredos, quando a prova existir, entram com `supabase secrets set` no
projeto de demonstração. Não entram no Git, no app nem no prompt:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Corte 1 — cobrança

A cliente, numa reserva já confirmada no provedor, inicia o pagamento. Sem
chave, a tela diz que a cobrança não está disponível. Não há pagamento
aprovado de mentira. O valor mostrado é o do serviço.

O webhook, com assinatura válida, grava o evento e aplica pago e payout
pendente na mesma função SQL. A comissão é
`round(amount_cents * commission_bps / 10000)`. O pendente é o restante.

| # | Parâmetro | Esperado |
| --- | --- | --- |
| 1 | Ambiente | Modo de teste, projeto de demonstração. A produção `detoxpass` não recebe esta chave nem esta cobrança. |
| 2 | Segredos | `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` só nos secrets da função. Fora do Git, do bundle e da resposta ao browser. |
| 3 | Sem chave | `stripe-charge` e `stripe-webhook` respondem 503. A tela diz que a cobrança não está disponível. |
| 4 | Reserva | Só `provider_confirmed`, da cliente autenticada. Outro estado ou outra pessoa, 403. |
| 5 | Preço | Serviço sem `price_cents` ou sem `currency` não abre checkout. O body não escolhe o valor. |
| 6 | Sessão | A resposta traz `checkout_url` e `stripe_session_id`. `metadata.booking_id` é o id da reserva. O banco fica `charge_created` com esse id e o valor do catálogo. |
| 7 | Sessão gravada e banco falhou | A resposta devolve o id da sessão e pede compensação. Não abre outra cobrança por cima. |
| 8 | Webhook sem assinatura ou com assinatura errada | 400. Nada de pago. |
| 9 | `checkout.session.completed` com `payment_status` `paid` | Ledger: `charge_confirmed` no total, `commission` pela regra de bps, `payout_pending` no restante. Saga `paid`. |
| 10 | Valor ou moeda diferentes da reserva | O evento fica com erro. A saga não vai para `paid`. |
| 11 | O mesmo `event.id` de novo | Uma linha de evento. Um trio no ledger. A segunda entrega não lança outra comissão. |
| 12 | Retry | Evento gravado e ainda não aplicado volta a ser aplicado por `retry_unapplied_payment_events`, ou pelo cron, uma vez. |
| 13 | Profissional | A tela dela não tem ação de se pagar. `authorize_payout` recusa o papel `profissional`. |
| 14 | Confirmação | `confirm_attendance` não muda `payout_pending` para `payout_released`. |

## Corte 2 — objeto Connect

Começa depois que o corte 1 tiver resultado nesta tabela. O candidato que
combina com o payout pendente é cobrança na plataforma e Transfer só na
autorização. Destination charge empurra o dinheiro na hora da cobrança.
Os dois podem ser ensaiados em modo de teste. A frase que entra em
[`DECISIONS.md`](./DECISIONS.md) sai do ensaio que mostrar o dinheiro parado
até a autorização. Este arquivo não escreve essa frase antes.

| # | Parâmetro | Esperado |
| --- | --- | --- |
| 15 | Conta conectada | A profissional de teste tem conta Connect apta a receber, no mesmo modo de teste. O id não aparece no bundle. |
| 16 | Dinheiro na cobrança | Até `authorize_payout`, o valor do atendimento permanece na plataforma. A comissão não sai nesse instante para a profissional. |
| 17 | Evidência | O teste registra o objeto usado (destination charge, Transfer ou outro), o id externo e onde o saldo ficou antes da autorização. |
| 18 | Decisão | Samuel ou Elias registra o objeto em `DECISIONS.md` depois dessa evidência. Sem esse registro, o corte 3 não começa. |

## Corte 3 — repasse

Depende do corte 2 registrado. A cliente confirma o atendimento. A operação
autoriza. A profissional vê o extrato e não vê botão de liberar.

| # | Parâmetro | Esperado |
| --- | --- | --- |
| 19 | Fila | A cliente vê o que já foi atendido e ainda não confirmou. Confirmar não mostra o repasse como liberado. |
| 20 | Quem confirma | `confirm_attendance` só para a cliente daquela reserva. Cancelada não confirma e não pontua. Paga e não confirmada não pontua. |
| 21 | Quem autoriza | `authorize_payout` só para operação, e só com confirmação. A segunda autorização não grava outro `payout_released`. |
| 22 | Movimento | A autorização cria o repasse no objeto decidido no corte 2 e grava o id externo junto com `payout_released`. Ledger e Stripe contam o mesmo valor. |
| 23 | Relatório | Pago, pendente e liberado batem com o ledger. |
| 24 | Reward | `confirmed_session` não escreve no ledger e não libera payout. |
| 25 | Estorno | `charge.refunded` grava a compensação do valor reembolsado. Prazo, multa e quanto volta continuam a política em aberto: o teste não inventa esse número. |

## Corte 4 — Gusto

Condicional. A função já responde desligada.

| # | Parâmetro | Esperado |
| --- | --- | --- |
| 26 | Sem opt-in | `gusto` responde 501 `optional_not_enabled`. Não há tela de Gusto no checkout. A fase fica dispensada por escrito e o corte para aqui. |
| 27 | Com opt-in | A estrutura aprovada entra em `DECISIONS.md` antes do código. O pagamento de contractor acontece depois da confirmação, visto pela operação. |
| 28 | Fronteira | O Gusto não abre checkout, não substitui a Stripe e não faz split da cobrança. Um atendimento não paga a profissional pela Transfer e pelo Gusto. |
| 29 | Fiscal | W-9 e 1099 ficam com a cliente e o contador. Este corte não emite os dois. |

## Relatório de teste

Data da prova: 2026-10-07. Samuel validou o Corte 1 manualmente em Stripe
Sandbox. Checkout Session, webhook `checkout.session.completed`, booking
`paid` e ledger (cobrança, comissão, repasse pendente) funcionaram. A
idempotência do webhook foi validada. Stripe Connect e Transfer ainda não
estão concluídos. Chave live não entrou neste corte.

| # | Resultado |
| --- | --- |
| 1 | Validado. Stripe Sandbox funcionando. Não é chave live. |
| 2 | Ainda não rodou como prova separada. Segredos continuam fora do Git. |
| 3 | Ainda não rodou na função publicada. O código, lido neste dia, devolve 503 quando o secret falta. |
| 4 | Ainda não rodou. |
| 5 | Ainda não rodou. |
| 6 | Validado. Checkout Session funcionando. O valor veio do backend. |
| 7 | Ainda não rodou. |
| 8 | Ainda não rodou. |
| 9 | Validado. Webhook `checkout.session.completed`. Booking atualizada para `paid`. Ledger com cobrança, comissão e repasse pendente. |
| 10 | Ainda não rodou. |
| 11 | Validado. Idempotência do webhook. |
| 12 | Ainda não rodou. |
| 13 | Ainda não rodou. |
| 14 | Ainda não rodou. |
| 15 | Ainda não concluído. Stripe Connect e Transfer ficam fora deste corte. |
| 16 | Ainda não rodou. |
| 17 | Ainda não rodou. |
| 18 | Ainda não rodou. `DECISIONS.md` segue com a arquitetura de payout pendente. |
| 19 | Ainda não rodou. |
| 20 | Ainda não rodou. |
| 21 | Ainda não rodou. |
| 22 | Ainda não rodou. `authorize_payout` hoje só grava o ledger. |
| 23 | Ainda não rodou. |
| 24 | Ainda não rodou. |
| 25 | Ainda não rodou. |
| 26 | Ainda não rodou na função publicada. O código, lido neste dia, responde 501 sem `GUSTO_ENABLED=true`. Não há opt-in registrado. |
| 27 | Ainda não rodou. |
| 28 | Ainda não rodou. |
| 29 | Ainda não rodou. |

## Fora deste corte

- Escolher destination charge ou Transfer antes da evidência do corte 2.
- Rodar a prova no projeto `detoxpass`.
- Chamar a Stripe ou o Gusto a partir do browser.
- Deixar a profissional autorizar o próprio repasse.
- Tratar a confirmação da cliente como liberação do dinheiro.
- Ligar o Gusto no checkout ou dividir a cobrança Stripe.
- Inventar prazo de estorno, no-show ou autorização automática. Isso espera decisão registrada.
- Marcar a integração como homologada porque a função compila.
