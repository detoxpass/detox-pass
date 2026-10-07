# Caixa de notificações e favoritos

Data: 2026-10-05. Decisão em [`DECISIONS.md`](../DECISIONS.md), seção
"A caixa de notificações é uma linha por destinatário".

A prova desta fase é o app publicado, na sequência da decisão
"A prova desta fase é o app publicado": commit e push em `detoxpass/main`,
`supabase db push --linked`, e o fluxo em `https://detox-pass.vercel.app`.
O resultado do teste está em [`ROADMAP-NOTIFICACOES-ACEITE.md`](../aceite/ROADMAP-NOTIFICACOES-ACEITE.md).

## O que esta fase entrega

Uma caixa dentro do app. Cada aviso é uma linha de `public.notifications`
para uma pessoa. Ler o aviso de uma pessoa não lê o da outra. O sino mostra
quantos avisos da sessão ainda estão sem `read_at`.

Favoritos continuam no aparelho, na chave `detox-pass-loved`. A página
`/favorites` mostra as profissionais ativas que esse aparelho salvou, no
mesmo cartão da busca. Não há tabela de favoritos.

Não há push do navegador, e-mail nem SMS nesta fase.

## O que o protótipo pedia e esta fase não copia

O protótipo histórico mostra avaliação, “+$100.24”, “+50 points” e um botão
de ligar notificações do aparelho. Isso não entra:

- Avaliação não é módulo.
- Não existe fórmula de pontos. Confirmar visita não escreve “+50 points”.
- Valor só aparece se `bookings.amount_cents` e `bookings.currency` estiverem
  gravados. Reserva interna nasce com valor nulo, então o texto não inventa
  dólar.
- O botão de push que não envia nada não entra na tela.

## Quem recebe cada aviso

`intent_opened` não vira aviso. É o estado interno “Checking”.

| Origem | Cliente | Profissional | Operação |
| ------ | ------- | ------------ | -------- |
| `provider_confirmed` | `reservation_reserved` | `reservation_received` | — |
| `cancelled` | `reservation_cancelled` | `reservation_cancelled` | `reservation_cancelled` |
| `rescheduled` | `reservation_moved` | `reservation_moved` | `reservation_moved` |
| `charge_created` | `charge_started` | — | `charge_started` |
| `paid` | `payment_confirmed` | `payment_recorded` | `payment_confirmed` |
| `compensation_required` | `reservation_needs_review` | `reservation_needs_review` | `reservation_needs_review` |
| `compensated` | `reservation_compensated` | `reservation_compensated` | `reservation_compensated` |
| `payout_released` | — | `payout_released` | `payout_released` |
| `attendance_confirmed` | `visit_confirmed` | `visit_confirmed` | `visit_confirmed` |
| ficha de parceiro inserida | — | `application_received` | `partner_applied`, uma linha por perfil `operacao` |
| `professionals.active` de falso para verdadeiro | — | `profile_visible` | — |
| `schedule_mode` saindo de vazio | — | `calendar_chosen` | — |

O texto usa o nome do serviço e da cidade já gravados na reserva. O link da
cliente abre `/sessions/:id`. O da profissional abre `/agenda/:id`. O da
operação abre `/admin/booking/:id`, ou `/admin/therapists/:id` no cadastro
de parceiro.

Um tipo desconhecido não derruba a reserva. Ele só não gera aviso até entrar
nesta tabela.

## Regras da linha

- A pessoa só lê e só marca as próprias linhas.
- O cliente não insere aviso.
- Só `read_at` muda depois da inserção.
- A mesma origem não duplica a linha da mesma pessoa e do mesmo tipo
  (`recipient_id`, `kind`, `source_id`).
- A data do aviso de reserva é `booking_events.created_at`. A do cadastro de
  parceiro é a data da ficha. Agenda escolhida e perfil visível nascem na
  hora em que a caixa grava a linha.
- Aprovar a ficha de novo não gera outra `profile_visible` para o mesmo id.
- Escolher a agenda de novo, depois de já ter escolhido, não gera outra
  `calendar_chosen` para o mesmo id.
- Não há backfill de `profile_visible` para fichas que já nasceram ativas.
  O aviso nasce na próxima virada de inativa para ativa.
- Fichas que já têm `schedule_mode` e cadastros de parceiro já gravados
  recebem o aviso correspondente uma vez, na migration.

Operação com zero contas não abre a tela. O fan-out ainda percorre
`profiles.role = operacao`. Com zero linhas, `partner_applied` fica em zero.
Isso não é falha da caixa.

## Favoritos

- A busca e a página da profissional continuam gravando a lista neste aparelho.
- `/favorites` lista só quem está ativa no catálogo.
- Tirar o coração atualiza a mesma lista.
- Conta que não é cliente pode abrir a rota. O cartão não leva a
  `/therapists`, que continua só da cliente. A busca também.

## Fora desta fase

- Push, e-mail e SMS.
- Favorito no servidor.
- Avaliação, pontos e valor inventado.
- Promover uma conta a operação para abrir a caixa dela.
- Suporte, recompensas, pagamentos e as cascas vazias do admin.

## Aceite

| # | Parâmetro | Prova |
| - | --------- | ----- |
| 1 | A migration está no projeto `detoxpass` e a tabela rejeita insert da sessão autenticada. | `supabase db push --linked` e um insert autenticado recusado. |
| 2 | Cada aviso de reserva existente virou linha da cliente e linha da profissional, com ids diferentes. | Contagem por `audience` e `kind` no projeto `detoxpass`, sem `intent_opened`. |
| 3 | Marcar lido na profissional não preenche `read_at` da cliente na mesma reserva. | Duas sessões no app publicado. |
| 4 | O sino da profissional mostra a contagem não lida e zera o item marcado. | `https://detox-pass.vercel.app/notifications` na conta profissional. |
| 5 | A profissional do cadastro vê “Application received”. Não há “+50”, “review” nem dólar inventado. | Caixa dela no app publicado e busca no texto das linhas. |
| 6 | `partner_applied` é zero enquanto não existir perfil `operacao`. A tela de operação não é aberta. | Contagem no projeto `detoxpass`. |
| 7 | `/favorites` mostra o cartão salvo neste aparelho e o coração o tira da lista. | Cliente no app publicado, busca e favoritos. |
| 8 | Em 390px as duas telas continuam uma coluna, com o botão de marcar tudo em largura cheia. | App publicado. |
