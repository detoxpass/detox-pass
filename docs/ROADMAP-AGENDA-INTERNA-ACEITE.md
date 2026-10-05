# Aceite da agenda interna

Data: 2026-10-05. Prova no app local contra o projeto `detoxpass`, com a migration
`20261005233000_internal_schedule.sql` aplicada e a função `scheduling-internal`
publicada. A profissional usada foi Sarah Anderson. A cliente foi a conta demo.

| # | Parâmetro | Resultado |
| - | --------- | --------- |
| 1 | Modal até definir ou pedir para não mostrar de novo. | Feito. Ao entrar, a Sarah viu o modal. "Continue without choosing" ficou desligado até marcar a caixa. |
| 2 | Interna fecha o modal e abre a grade. | Feito. "Use Detox Pass calendar" fechou o modal. A agenda mostrou fuso, duração, janela semanal e bloqueio. |
| 3 | Sem escolha, a cliente não vê horário. | Feito. David Rodriguez: "This professional has not chosen a calendar yet. No time is offered." |
| 4 | A cliente vê só a janela publicada. | Feito. Segunda, 09:00–17:00 em `America/New_York`, 60 minutos. Outubro devolveu 5, 12, 19 e 26. No dia 12, os horários foram de 14:00 a 20:00 UTC. O das 13:00 UTC, já reservado, não voltou. |
| 5 | Reserva interna sem valor. | Feito. `provider = internal`, `provider_confirmed`, `amount_cents` nulo, id externo `internal:` mais o id da reserva. |
| 6 | Dois pedidos no mesmo instante. | Feito. Duas chamadas juntas: uma confirmou, a outra voltou que o horário não está aberto. A lista seguinte tinha 7 horários, não 8. |
| 7 | Bloqueio sobre reserva ativa. | Feito. O insert do bloqueio respondeu 409, "há reserva nesse intervalo". |
| 8 | Profissional não cancela a reserva da cliente. | Feito. A chamada com a Sarah respondeu 403. Na agenda dela o detalhe não tem cancelar nem reagendar, e o texto é "Not paid". |
| 9 | Externa continua sem grade interna. | Não ensaiado nesta rodada. A Sarah ficou em interna. O caminho externo segue na função da Acuity, e sem token a página continua pendente. |
| 10 | O preço não vai na reserva. | Feito. A resposta do `book` não traz valor. `amount_cents` ficou nulo. A tela diz que o preço permanece no serviço. |

Duas reservas de teste ficaram na Sarah, às 13:00 UTC de 5 e de 12 de outubro de 2026. A de 12 de outubro é `274295a1-e64a-4981-8993-0ef9631919fb`.

O teste de banco local não rodou: o Docker desta máquina está parado. Os casos novos estão em `supabase/tests/database/invariants.sql`.
