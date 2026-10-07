# Aceite do corte 1–4

Data: 2026-10-05. Ambiente verificado: app local em `http://127.0.0.1:5173` contra o projeto `detoxpass`, mais a migration e as funções publicadas nesse projeto.

Este relatório não marca como feito o que não teve evidência.

| # | Parâmetro | Resultado |
| - | --------- | --------- |
| 1 | Rotas recarregam na mesma tela. `/delete-account` segue pública e sem shell. | Feito. Recarregar `/therapists/:id` reabriu a profissional. `/sessions` lista vazia. `/delete-account` abre a página pública. |
| 2 | Telas novas têm carregando, vazio, erro, sem permissão e, no horário, pendente. | Feito no que foi exercitado. Sessões vazias, rewards vazio, operação negada para a cliente, calendário sem token em pendente. |
| 3 | A página não fala com a Acuity direto. | Feito. O painel chama `scheduling-acuity`. |
| 4 | Typecheck e build do app no CI. | O workflow foi acrescentado. O typecheck local passou. O GitHub ainda não tinha rodado este commit na hora do relatório. |
| 5 | E-mail de auth abre o app publicado. | `site_url` de produção passou a `https://detox-pass.vercel.app`, com redirect para esse domínio e para o Vite local. O envio de um e-mail real não foi disparado. |
| 6 | Conta `operacao`. | Não. Há zero perfis `operacao`. O snippet continua com e-mail de exemplo. Falta o e-mail de quem será operação. |
| 7 | Operação altera preço, cidade, serviço, vínculo e ativo. A cliente não grava. | A tela e a RLS estão no ar. A cliente foi barrada em `/admin/therapists`. Não houve sessão de operação para gravar um preço. O teste de banco novo cobre a cliente no `update`, e ainda não rodou aqui porque o runner local não tem Docker. |
| 8 | Inativa fora da busca. Vários serviços e cidades. | A home continua só com ativas. O formulário grava vários vínculos. Não houve uma ficha nova inativada nesta sessão. |
| 9 | Token fora de tabela pública, resposta, `localStorage` e bundle. | O campo de token não é relido. Nada de segredo foi commitado. Não houve token de teste para gravar. |
| 10 | Sem credencial, o painel é pendente e não aceita hora digitada. | Feito. A página da profissional mostrou “Availability did not come from the calendar.” |
| 11 | POC autenticada: dias, horários, criar, reagendar, cancelar e ler. | Não. Não há credencial de teste nem staging. A Acuity não está homologada. |
| 12 | Webhook assinado ou pendente com leitura sob demanda. | A função `scheduling-acuity-webhook` está publicada sem JWT e recusa pedido sem assinatura. Nenhuma conta Acuity registrou a URL. A leitura sob demanda existe na tela da operação. |
| 13 | Dois cliques no mesmo horário não abrem duas reservas. | A migration `bookings_slot_hold_uidx` está no projeto. O teste pgTAP foi escrito e não executou sem Docker. |
| 14 | Reserva `provider_confirmed` com ids e sem valor pago. | O código faz isso. Nenhuma reserva foi criada, porque não há agenda ligada. |
| 15 | Cancelar e reagendar acertam os dois lados ou mostram a falha. | Implementado na função, com compensação. Sem credencial, não houve rehearsal. |
| 16 | Profissional não cancela, não reagenda e não libera repasse. | A agenda dela é só leitura. Pagamentos dela é estado vazio, sem ação de liberar. |
| 17 | Nenhuma agenda foi chamada de homologada. | Feito. Não existe controle para marcar homologada. O status de teste só muda pela função de serviço, e ela não foi chamada. |
| 18 | 390px e desktop. | Em 390px a navbar fica abaixo da área que rola, e o bloco do calendário cabe na largura. Desktop usou a janela do navegador local. |

## O que foi publicado no banco e nas funções

- Migration `20261005221509_booking_slot_and_connection_status.sql` no projeto `detoxpass`. O índice `bookings_slot_hold_uidx` existe.
- Funções `scheduling-acuity`, `commands` e `scheduling-acuity-webhook`.

## O que este corte deixa em aberto

- E-mail da primeira operação, para rodar `supabase/snippets/promote-operator.sql` fora do Git.
- Staging, até Samuel aprovar conta e custo.
- Credencial Acuity e o relatório das respostas reais.
- Appointment type por serviço, se a POC mostrar que um tipo por profissional não serve.
- Estorno, prazo de cancelamento e dinheiro já capturado.
