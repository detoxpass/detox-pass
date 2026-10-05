# Agenda interna e escolha da profissional

Data: 2026-10-05. Decisão em [`DECISIONS.md`](./DECISIONS.md), seção
"A profissional escolhe agenda interna ou externa".

Esta fase não cobra, não libera repasse e não marca nenhuma agenda externa
como homologada. A conta Acuity da plataforma não vira a agenda de todas.

## O que a profissional faz

Ela escolhe uma agenda para a ficha dela.

| Modo | O que acontece |
| ---- | -------------- |
| Interna | Ela publica janelas semanais, a duração do horário, o fuso e os bloqueios. A cliente reserva um desses instantes. O evento fica nessa agenda. |
| Externa | A reserva segue o adapter da conta dela (Acuity primeiro). O token é o da ficha, no Vault. A senha dessa conta não é da plataforma e não é repassada. |
| Sem escolha | A página da cliente não oferece horário. |

O modal abre para a profissional enquanto `schedule_mode` estiver vazio e ela
não tiver pedido para esconder. Definir interna ou externa fecha o modal.
Marcar "não mostrar de novo" sem escolher também fecha. A agenda continua sem
horário até a escolha existir. Ela pode trocar o modo depois, na própria agenda.

## Gestão interna

- Janelas por dia da semana, em minutos, no fuso gravado na ficha.
- Duração do horário: 30, 45, 60, 90 ou 120 minutos.
- Fusos aceitos: `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, `America/Sao_Paulo`.
- Bloqueio com início e fim. Bloqueio em cima de reserva que ainda segura o horário é recusado.
- A profissional não cancela nem reagenda a reserva da cliente. Quem muda a reserva é a cliente ou a operação, para outro instante que a grade ainda tenha aberto.
- Preço continua no serviço. `amount_cents` da reserva interna nasce nulo.

## Disputa de horário

Uma reserva interna ocupa `[starts_at, ends_at)`. O banco recusa outra reserva
da mesma profissional que cruze esse intervalo enquanto o status ainda segura o
horário. A segunda tentativa recebe o erro de horário já em andamento. A função
também só abre intenção se o instante ainda pertence à grade, não cai em
bloqueio e não cruza outra reserva.

## Fora desta fase

- OAuth dos cinco provedores. Externa continua pelo token que a operação grava na ficha.
- Pagamento, estorno, confirmação de atendimento e repasse.
- Tratar a interna como substituta quando a Acuity falha. Sem modo interno escolhido, a tela fica pendente.

## Aceite

| # | Parâmetro | Prova |
| - | --------- | ----- |
| 1 | Modal da profissional até ela definir o modo ou pedir para não mostrar de novo. | `https://detox-pass.vercel.app`, conta profissional sem escolha. |
| 2 | Definir interna fecha o modal e a agenda mostra a grade. | A mesma sessão publicada, depois da escolha. |
| 3 | Cliente não vê horário enquanto o modo está vazio. | Página publicada da profissional. |
| 4 | Com janela publicada, a cliente vê só instantes gerados por essa janela. | Função `scheduling-internal` no projeto `detoxpass`, um dia coberto e um dia fora. |
| 5 | Reservar grava `provider = internal`, `provider_confirmed`, id interno e `amount_cents` nulo. | Reserva criada no projeto `detoxpass`. |
| 6 | Segundo pedido no mesmo intervalo não cria outra reserva ativa. | Duas chamadas no mesmo instante, na função publicada. |
| 7 | Bloqueio sobre reserva ativa é recusado. | Insert do bloqueio no projeto `detoxpass`. |
| 8 | Profissional não cancela a reserva da cliente. | App publicado, papel profissional. |
| 9 | Externa não usa a grade interna. Sem token daquela ficha, a página continua pendente. | Profissional em modo externo, sem conexão, no app publicado. |
| 10 | Preço do serviço não entra no corpo da reserva. | Resposta do `book` publicado, sem valor cobrado. |
