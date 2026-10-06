# Square

Data: 2026-10-06. A Square é a primeira agenda externa. O sandbox já fechou
ida e volta. A profissional não cola token: ela entra na própria tela da
Square, autoriza a Detox Pass e a conta fica gravada no cofre. Homologada
continua fora. A ficha Detox Pass segue inativa, sem serviço e sem cidade.
A Sarah Anderson segue na agenda interna.

## O que esta conta já comprovou

Ambiente sandbox. Unidade Default Test Account, fuso `America/Anchorage`.
Serviço "Sessão Detox", variação Regular de 30 minutos. A version do
catálogo é lida na hora de criar. A busca do mês corrente começa um minuto
à frente, porque a Square recusa um início no passado.

| Prova | Resultado |
| --- | --- |
| Ida pela função publicada | Criar, reagendar, cancelar e ler na mesma reserva. Os dois lados fecharam cancelados, sem divergência. O status da conexão ficou `tested`. |
| Volta, horário | A reserva `xy048lbzyfbh0k` foi movida na Square para 15:00 em Brasília (18:00 UTC). A plataforma gravou o horário novo com origem `square`. |
| Volta, cancelamento | A mesma reserva foi cancelada na Square. Aqui ficou `cancelled`. A leitura ao vivo mostrou os dois lados cancelados, no mesmo horário, sem divergência. |
| Horário que nasce só na Square | Cliente novo da Square, e depois o Cliente Demo que já tem conta aqui. Os dois avisos responderam 200 e não criaram reserva. E-mail igual não vira cliente, serviço nem cidade. |
| Horário ocupado | A disponibilidade é a busca ao vivo da Square. Um horário que existe só lá some da lista daquela pessoa, sem linha local. |
| Assinatura | Sem chave ou sem header, 401 `assinatura ausente`. Assinatura errada, 401 `assinatura inválida`. Assinatura válida de um id desconhecido, 200 e nada gravado. |
| Tela | A Agenda lista as cinco agendas. Square conecta. Acuity, Wix, Zenoti e Mindbody aparecem e esta tela não as conecta. |

A chave de assinatura do sandbox está no secret `SQUARE_WEBHOOK_SIGNATURE_KEY`.
Não está no Git. O endereço do webhook, sem barra no final:

```
https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-webhook
```

Eventos `booking.created` e `booking.updated`. Versão `2025-01-23`.
O detalhe do aviso está em [`SQUARE-WEBHOOK.md`](./SQUARE-WEBHOOK.md).

`booking.created` é ignorado. A ida já criou a reserva daqui. Um aviso que só
muda a version interna da Square não reagenda. Cancelar de novo não grava
outro efeito.

## O que a profissional faz agora

Na Agenda ela escolhe Square e aperta **Connect with Square**. A tela abre
o login da Square, na conta de produção. A Square
mostra as permissões e, se ela aceitar, devolve um código para este endereço:

```
https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-oauth
```

A função troca o código por access token e refresh token, descobre unidade,
pessoa e serviço, e grava no Vault. Se houver um de cada, a agenda já fica
ligada. Se houver mais de um, a Agenda mostra a lista e só então grava a
escolha. O token não volta para a tela.

O access token da Square vence em 30 dias. O refresh token deste fluxo não
vence enquanto a autorização existir. A função renova ao usar a agenda quando
o token tem mais de 7 dias ou falta menos de 8 dias para vencer. Um trabalho
diário, às 09:20 UTC, faz o mesmo para quem não abriu a agenda. Os dois usam
o mesmo cofre.

**Disconnect Square** revoga a autorização na Square quando o login foi por
OAuth, apaga o token daqui e tira a Square de agenda ativa. Um token colado
pela operação não tem o que revogar na Square; a desconexão só vale aqui.

A operação continua com o campo de access token na ficha, só para o sandbox.
Regravar o mesmo token não apaga o refresh de um login já feito. A
profissional não vê Application ID, Application Secret, URL de webhook nem
Signature key.

Permissões pedidas, e nenhuma a mais: `APPOINTMENTS_READ`,
`APPOINTMENTS_ALL_READ`, `APPOINTMENTS_WRITE`, `APPOINTMENTS_ALL_WRITE`,
`MERCHANT_PROFILE_READ`, `EMPLOYEES_READ`, `ITEMS_READ`, `CUSTOMERS_READ`,
`CUSTOMERS_WRITE`. Pagamento não entra.

## O que ainda falta no painel da Square

O código e a tela estão publicados. O primeiro login só completa depois
destes passos, feitos uma vez no aplicativo da Detox Pass. Cada profissional
não cria aplicativo nem webhook. Todas usam este.

1. No Developer Console, aplicativo sandbox, página OAuth, registrar a URL
   de redirect exatamente como está acima, sem barra no final. Enquanto ela
   não estiver lá, a Square recusa o retorno e a Agenda mostra que o login
   não terminou. Nada da conexão já testada é apagado nesse caso.
2. Application ID e Application Secret do sandbox já estão nos secrets
   `SQUARE_SANDBOX_APPLICATION_ID` e `SQUARE_SANDBOX_APPLICATION_SECRET`.
   Não estão no Git.
3. A profissional precisa de conta de seller, Square Appointments ligado,
   uma unidade, uma pessoa e um serviço com duração. Se faltar algum, a
   Agenda não marca a Square como conectada.
4. O aplicativo de produção já tem Application ID e Application Secret nos
   secrets `SQUARE_PRODUCTION_APPLICATION_ID` e
   `SQUARE_PRODUCTION_APPLICATION_SECRET`. A Agenda da profissional abre
   esse login. A Signature key de produção entra em
   `SQUARE_WEBHOOK_SIGNATURE_KEY_PRODUCTION`. O webhook usa a mesma URL.
   Enquanto essa chave não existir, um aviso assinado só por ela responde
   401. O sandbox continua válido para o token que a operação cola.

O marketplace da Square é o mesmo login, mais tarde. Não é requisito da
primeira profissional.

## O que este corte não faz

- Marcar a Square como homologada. `tested` é o ciclo sandbox já feito.
  O login OAuth ainda não foi concluído por uma profissional nesta conta.
- Ativar a Detox Pass ou ligar serviço e cidade nela.
- Reservar agenda externa pelo chat.
- Importar um horário que nasceu só na Square.
- Tratar aviso de version como reagendamento.
- Empurrar bloqueio pessoal daqui para a Square.
- Dividir o pagamento na Square. A comissão continua na regra da plataforma.
