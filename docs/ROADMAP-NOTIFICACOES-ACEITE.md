# Aceite — caixa de notificações e favoritos

Data: 2026-10-06. App `https://detox-pass.vercel.app`. Projeto `detoxpass`
(`otddminugslmacdirual`). Commits `0491e6d` e `20da564` em `detoxpass/main`.
Deploy de produção `dpl_2TX7CM8wfg3rYsdmXmmvG86ejTsz` no commit da tela.

A tela de operação não foi aberta. Continua sem perfil `operacao`.

## Parâmetros

| # | Resultado |
| - | --------- |
| 1 | Migration `20261006025529_notifications_inbox` aplicada. Políticas da tabela: select e update. Não há política de insert. Um insert no papel `authenticated` não passou. |
| 2 | Os 5 `provider_confirmed` viraram `reservation_reserved` da cliente e `reservation_received` da profissional. Os 2 `cancelled` e os 2 `rescheduled` viraram uma linha de cada lado. Os 5 `intent_opened` não geraram aviso. |
| 3 | A profissional abriu o aviso das 22:05. A linha dela ficou lida. A linha da cliente, do mesmo `source_id`, continuou não lida. No app, a cliente ainda via “Session reserved” das 22:05 dentro de “9 new”. |
| 4 | O sino da Sarah Anderson mostrou 10, depois 9, e o clique abriu `/agenda/a9b931c1-6bde-44b7-8c4c-d101afd1d15a`. |
| 5 | Front Partner viu “Application received” e “Calendar chosen”. O texto “under review” é o cadastro, não uma avaliação. Nenhuma linha tem “+50” nem dólar. `amount_cents` dessas reservas segue nulo, então o corpo não cita valor. |
| 6 | `partner_applied` e qualquer linha `operacao`: zero. |
| 7 | A cliente salvou David Rodriguez na busca. `/favorites` mostrou o cartão. O cartão abriu `/therapists/8ee0fe26-fda5-4a19-9f09-062a6eedd528`. O coração tirou o cartão e a página voltou para “No saved therapists”. |
| 8 | Em 390px a caixa e os favoritos ficam numa coluna. “Mark all read” ocupa a largura do hero. Em 1180px a lista da cliente fica em duas colunas de 428px. |

## O que a caixa tem hoje

| Papel | O que apareceu |
| ----- | -------------- |
| Cliente Demo | 5 sessões reservadas, 2 canceladas, 2 reagendadas. Nove não lidas. |
| Sarah Anderson | As mesmas reservas, no texto da profissional, mais “Calendar chosen”. Uma reservada foi lida no teste. |
| Front Partner | Cadastro em análise e agenda interna escolhida. |
| Operação | Nenhuma conta. Nenhuma linha. |

Pagamento, visita confirmada, compensação, repasse e “perfil visível” estão no fan-out. Não há evento desses no banco, então a tela não mostrou essas cópias. A data de reserva e de cadastro é a data do fato (`20261006030600_notification_event_time`). “Calendar chosen” das fichas que já tinham agenda usa a hora em que a caixa foi criada.
