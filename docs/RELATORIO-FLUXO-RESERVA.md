# Relatório do fluxo de reserva

Data: 2026-10-05. Prova no app `https://detox-pass.vercel.app` e na função
`scheduling-internal` do projeto `detoxpass`. A hora na tela é a do aparelho.
13:00 UTC aparece como 10:00 da manhã neste fuso.

O banco tem 1 cliente e 5 profissionais. Não há usuário com papel `operacao`.

## Caminho

1. A cliente abre a ficha, toca em Reserve e escolhe serviço, dia e hora.
2. A reserva nasce `internal`, confirmada no provedor, sem valor.
3. Ela vê a sessão, muda para outro horário aberto e cancela com confirmação.
4. A profissional vê a mesma reserva na agenda. Não move e não cancela.
5. A operação teria a lista em `/admin/booking`, com mover, cancelar e conferir o calendário. Essa conta não existe, então a tela não foi aberta.

## Provas

| Prova | Resposta | O que ficou |
| --- | --- | --- |
| Cliente reserva | 200 | `provider_confirmed`, id `internal:`, `amount_cents` nulo |
| Segundo pedido no mesmo instante | 422 | Uma reserva só. A mensagem é que o horário não está aberto |
| Cliente lê a própria reserva | 200 | Agenda interna, sem divergência |
| Cliente muda para outro horário aberto | 200 | O antigo volta e o novo sai da lista |
| Cliente muda para horário ocupado ou fora da grade | 422 | A reserva permanece |
| Cliente cancela | 200 | `cancelled`, valor nulo, os 8 horários voltam |
| Profissional vê a reserva | 200 | A mesma linha |
| Profissional reserva | 403 | só a cliente reserva |
| Profissional move, cancela ou lê | 403 | reserva indisponível |
| Cliente em `/agenda` ou `/admin/booking` | Tela | You can't open this |
| Profissional em `/sessions` ou `/find` | Tela | You can't open this |
| Operação | Sem prova | 0 contas |

## O que a tela fez

A cliente reservou Deep tissue em Boston, 26 de outubro, 11:00. O modal mostrou
Reserved e abriu Minhas sessões. A mudança foi para 12:00, com o histórico
"Time changed". O cancelamento pediu confirmação, avisou que não há estorno, e
o histórico registrou "Reservation cancelled". A profissional viu essa reserva
às 12:00, sem botão de mover ou cancelar.

Duas reservas antigas continuam ativas na Sarah: 5 e 12 de outubro, 10:00 neste
fuso. As de teste de 19 e 26 de outubro ficaram canceladas. O dia 26 voltou a
oferecer 8 horários.

Pagamento, estorno, repasse e a agenda externa ficaram de fora. David, sem
escolha de agenda, segue sem horário e sem o botão Reserve.
