# Agendas externas

Data: 2026-10-06. A ordem comercial continua Acuity, Square, Wix, Zenoti,
Mindbody. A primeira que esta conta conseguiu criar, reagendar e cancelar foi
a Square, no sandbox. O trabalho começa por ela. As outras seguem o mesmo
desenho, cada uma com a própria prova. Nenhuma fica homologada porque o
adapter existe.

A ficha Detox Pass guarda as três credenciais. A agenda que a cliente usaria
é a Square (`is_source`). Acuity e Wix continuam no cofre, fora da reserva.
A Sarah Anderson segue na agenda interna.

## O desenho, igual para as cinco

Uma profissional pode ter várias credenciais. Só uma linha de
`schedule_connections` fica com `is_source`. Essa é a porta da reserva.

| Peça | O que é |
| --- | --- |
| Ida | `scheduling-{provedor}`: disponibilidade, dias do mês, criar, reagendar, cancelar, ler e gravar token. A tela não fala com o provedor. |
| Volta | `scheduling-{provedor}-webhook`, sem JWT de usuário. A autenticação é a assinatura. Pedido sem assinatura responde 401 e não grava. |
| Reserva | A função nomeia o provedor. A duração externa entra na abertura. Sem nome, vale a linha `is_source`. |
| Aviso de id desconhecido | Ignora. Não inventa cliente, serviço nem cidade. |
| Repetição | Cancelar de novo, ou repetir o mesmo horário, não grava outro efeito. |
| Status | Continua `pending` até a função publicada fechar o ciclo numa ficha ativa. `tested` é esse ciclo. Homologada é outra decisão. |

A origem do reagendamento já aceita `platform`, `acuity`, `square`, `wix`,
`zenoti` e `mindbody`. A próxima agenda não precisa de migration só para o nome.

## 1. Square

O corte desta agenda está em [`ROADMAP-SQUARE.md`](./ROADMAP-SQUARE.md).
A ida e a volta no sandbox já fecharam ciclo. A profissional passa a entrar
pela tela de autorização da Square. Homologada continua fora.

## 2. Acuity

A função e o webhook já existem. A documentação descreve criar, reagendar,
cancelar e os avisos `scheduled`, `rescheduled`, `canceled` e `changed`.

Nesta conta a API responde 403: só o plano Powerhouse abre a API. O id
numérico `99108456` está gravado e não foi confirmado como appointment type.
O webhook publicado recusa pedido sem assinatura. Nenhuma conta registrou a URL.

Quando houver plano, ou outra conta com API: listar os tipos, confirmar o id,
e a função publicada consulta, cria, reagenda e cancela. Aí o status pode ir
a `tested`.

## 3. Wix

A documentação separa criar, confirmar, reagendar e cancelar, e tem aviso para
cada passo. Criar não é confirmar.

App ID e App secret emitem um Bearer de 4 horas. Esse token não lê a agenda
do site. O Instance ID recebido era o HTML de example.com e não foi gravado.
`external_resource_id` está nulo. A função `scheduling-wix` continua pendente.

O corte começa quando existir a instance da instalação. Com ela: token do
site, lista de serviços, e o teste das duas etapas se a API as separar.

## 4. Zenoti

Sem credencial. A função responde pendente. A documentação comercial desta
conta marca o cancelamento como dependente da invoice. O aceite é um teste
autenticado que inclui o cancelamento real, ou o registro de que o plano não
deixa. Até lá, a tela não desenha horário.

## 5. Mindbody

Sem credencial. A função responde pendente. Produção depende do onboarding do
fornecedor. O aceite é o teste autenticado e, para produção, esse onboarding.

## Fora deste corte

- Marcar qualquer agenda como homologada.
- Ativar a Detox Pass ou ligar serviço e cidade nela.
- Reservar agenda externa pelo chat. O chat continua na grade interna.
- Tratar aviso interno da Square, que muda só a versão, como reagendamento.
- Criar aqui uma reserva que nasceu só na agenda de fora.
