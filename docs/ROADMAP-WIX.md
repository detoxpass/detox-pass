# Wix

Data: 2026-10-07. A Wix é a próxima agenda externa desta ficha. A Square
continua `tested` e `is_source`. Homologada continua fora. `scheduling-wix`
cria, confirma, reagenda, cancela e lê. O webhook confere o JWT. O botão
Connect with Wix abre a instalação. O status da conexão continua `pending`
até o ciclo numa ficha ativa. Este arquivo é o plano e o relatório. A
reserva da cliente nesta ficha continua na Square.

A conta é a mesma da Square: profissional Detox Pass,
`9a038721-84f0-4584-bf91-6e6a341ad9e0`. A conexão Wix já existia,
`80f2abd0-664d-4f8f-b410-27b62426234c`, com App ID e App secret no Vault e
sem instance. A instance e a chave pública entraram nesse mesmo cofre. O
status ficou `pending`. `is_source` ficou falso. `external_resource_id`
ficou nulo, porque essa coluna é o serviço escolhido e esta conta tem três.

A ficha segue inativa. A leitura de hoje encontrou o serviço Therapeutic,
USD 100, e a cidade Boston. Este corte não apaga os dois e não publica a
ficha. A Sarah Anderson não entrou nesta gravação.

## O que esta conta já comprovou

Site **Teste Detox Pass**, locale `pt`, fuso `America/Sao_Paulo`. Instance
`4f8cda49-3813-4c19-8596-d6f39bcdc823`. App ID
`4ffdd18c-605d-4693-999e-b947f3c563a9`. O App secret e a chave pública estão
no Vault, na conexão acima. Não estão no Git.

O token saiu de `POST https://www.wixapis.com/oauth2/token`, com
`grant_type` `client_credentials`, o App ID, o App secret e a instance.
HTTP 200, `expires_in` 14400. O access token não foi gravado. A função, quando
existir, pede outro quando precisar.

Permissões que a instance devolveu:

- `SCOPE.DC-BOOKINGS.MANAGE-BOOKINGS`
- `SCOPE.DC-BOOKINGS.READ-CALENDAR`
- `SCOPE.DEV_CENTER.APP-INSTANCE-READ-BASIC-INFO`

| Prova | Resultado |
| --- | --- |
| Token com instance | 200, 4 horas. A instance lida de volta é a mesma. |
| Site | Teste Detox Pass, `America/Sao_Paulo`. |
| Serviços | Três, todos `APPOINTMENT`, reserva online ligada. Tabela abaixo. |
| Horários da Consultoria Nutricional | 90 livres de 7 a 14 de outubro de 2026, fuso de São Paulo. O primeiro é 10:00–11:00 no dia 7. `locationType` veio `BUSINESS`. |
| Cofre | Quatro campos: `appId`, `appSecret`, `instanceId`, `publicKeyPem`. A instance gravada é a de cima. A chave começa e termina no bloco PEM. |
| Square na mesma ficha | Continua `tested` e `is_source`. |
| Criar, confirmar, reagendar, cancelar | Ainda não rodou. |
| Webhook | Publicado. GET 405. POST vazio: 401 `assinatura ausente`. POST sem JWT: 401 `assinatura inválida`. Nenhum aviso gravou reserva. |

| Serviço | Id | Preço | Pagamento | Agenda |
| --- | --- | --- | --- | --- |
| Detox Facial | `0d5a280f-606d-48cf-90e2-8b1151e4c716` | sem preço fixo | presencial, online desligado | `95c06ad4-cec3-44f7-8875-b1bed626c9a2` |
| Consultoria Nutricional | `48c91dbd-c226-4e31-87ea-1a2ec86fa9e2` | R$ 70 | online ligado | `e1c6cd1c-a5b1-4267-bdca-58affc74d99f` |
| Corporal Detox | `d8353d19-9bb7-4a58-bc25-8203c45124de` | R$ 120 | online ligado | `d9d7dced-4b53-4bd3-ab8d-a5165f67f4e3` |

Os três apontam para a mesma pessoa,
`e1ca6309-d32f-4c97-b14f-a04fa4594682`. Os horários dos outros dois serviços
não foram lidos.

A leitura sem instance, feita antes, recebeu 403 em serviços e em instance.
Esse HTML de example.com não foi gravado. A instance desta tabela é a que
abriu o site.

## Como a profissional vai conectar

Uma app para todas. A profissional não cola App ID, App secret, chave
pública, instance nem URL de webhook. O botão da Agenda se chama
**Connect with Wix** e abre a instalação da própria Wix, no fluxo externo
atual:

```
https://www.wix.com/app-installer?appId=<APP_ID>&postInstallationUrl=<callback>
```

O callback, sem barra no final, quando a função existir:

```
https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-wix-oauth
```

A Wix devolve `instanceId` e `signedInstance`. A função confere
`signedInstance` com a chave pública. Instance sem assinatura válida não
grava. O `state` leva o id da profissional e volta igual; se voltar outro,
a função não grava.

Com a instance, o token é o mesmo `client_credentials` já comprovado. Dura
4 horas. A função pede outro. Este grant não precisa de refresh token. O
instalador antigo `www.wix.com/installer/install` fica de fora: a
documentação atual manda o `app-installer`, e o token que esta conta já
consegue emitir usa a instance, não um código de 10 minutos.

Se a app for unlisted, a Wix pede `shareUrlId` nessa URL. O primeiro clique
registra se pediu. Se pediu, o id entra num secret do projeto. A
profissional não cola esse id.

Depois do retorno, a função lista os serviços `APPOINTMENT`. Um só: grava o
id em `external_resource_id` e deixa `pending`. Mais de um: a Agenda mostra
nome e preço, e só então grava a escolha. Este site tem três, então o
primeiro login nele mostra a lista. Não escolhe Detox Facial, Consultoria
nem Corporal sozinho. O token não volta para a tela.

**Disconnect Wix** apaga o segredo desta conexão e tira a Wix de origem, se
um dia ela estiver. Não desinstala a app no site. Essa desinstalação não
foi testada.

Hoje o App secret e a chave pública estão no cofre desta conexão, porque o
projeto ainda não tem secret de app. Quando o botão existir, os três valores
da app passam para `WIX_APP_ID`, `WIX_APP_SECRET` e
`WIX_WEBHOOK_PUBLIC_KEY`. Cada profissional guarda só a instance. Até essa
mudança, esta linha continua com os quatro campos, para a leitura de hoje
seguir válida.

A Agenda tem o botão **Connect with Wix**. Ele abre a instalação e volta
para `scheduling-wix-oauth`. Um serviço grava sozinho. Este site tem três,
então a volta pede a escolha. A Square desta ficha não perde a origem.

## Ida

`scheduling-wix` nomeia o provedor. A cliente não fala com a Wix. A Square
permanece a origem desta ficha. A prova chama a função Wix pelo nome, sem
trocar `is_source`.

A documentação da Wix separa criar e confirmar. Criar devolve `CREATED` e o
horário ainda não entra no calendário. Confirmar é que publica.

| Passo | Chamada | O que a prova precisa ver |
| --- | --- | --- |
| Dias e horários | `POST https://www.wixapis.com/_api/service-availability/v2/time-slots` | Datas locais `YYYY-MM-DDThh:mm:ss`, fuso `America/Sao_Paulo`, `bookable` verdadeiro. O slot desta conta veio com `locationType` `BUSINESS`. |
| Criar | `POST https://www.wixapis.com/_api/bookings-service/v2/bookings` | `location.locationType` `OWNER_BUSINESS`. Status `CREATED`. |
| Confirmar | `POST https://www.wixapis.com/_api/bookings-service/v2/bookings/{id}/confirm` | No serviço presencial, `paymentStatus` `NOT_PAID`. Status `CONFIRMED`. |
| Reagendar | a chamada de reschedule da Bookings, no horário livre seguinte | Os dois lados no horário novo, origem `wix`. |
| Cancelar | a chamada de cancel da Bookings | Os dois lados cancelados. Repetir não grava outro efeito. |
| Ler | a leitura da mesma reserva | `diverged` falso. |

Detox Facial é o candidato da confirmação sem carrinho: o pagamento online
está desligado e a opção presencial está ligada. Não tem preço fixo. A prova
não inventa preço.

Consultoria Nutricional e Corporal Detox têm pagamento online. Se a
confirmação sem carrinho for recusada, a recusa fica registrada e o ciclo
não fecha nesses dois. Carrinho e checkout da Wix não substituem a cobrança
da plataforma. A comissão continua na regra daqui.

Um horário que existe só na Wix não vira reserva. A ida é que cria a linha
local.

## Volta

A URL, sem barra no final, quando a função existir:

```
https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-wix-webhook
```

`verify_jwt` fica falso, como na Square. O corpo é um JWT. A função confere
com `WIX_WEBHOOK_PUBLIC_KEY`, ou com a chave deste cofre enquanto o secret
do projeto não existir. Sem JWT, ou com assinatura inválida, 401 e nada
gravado. JWT válido de um id que não está aqui: 200 e nada gravado. Não
inventa cliente, serviço nem cidade.

A função publicada é `scheduling-wix-webhook`, com `verify_jwt` falso. Os
eventos, pelos nomes do painel da app:

- Booking Created
- Booking Confirmed
- Booking Updated
- Booking Canceled

O `slug` interno sai do primeiro JWT válido. Este plano não inventa o slug.

| Aviso | Reserva já existe aqui | O que acontece |
| --- | --- | --- |
| Booking Created | sim ou não | ignora. A ida já criou. |
| Booking Confirmed | sim, ainda `CREATED` | confirma aqui. Repetir não confirma de novo. |
| Booking Updated com outro início | sim | grava o horário novo, origem `wix`. |
| Booking Updated no mesmo horário | sim | ignora. |
| Booking Canceled | sim | cancela. Repetir não cancela de novo. |
| qualquer aviso de um id desconhecido | não | ignora. |

## Parâmetros de aceite

O status sai de `pending` quando a função publicada fechar o ciclo numa
ficha ativa e os dois lados ficarem iguais. `tested` é esse ciclo.
Homologada é outra decisão. Esta ficha pode ser ativada só durante a prova
e volta a inativa no fim, como a Square. A origem volta para a Square se a
prova tiver precisado trocar.

| # | Parâmetro | Esperado | Resultado em 2026-10-07 |
| --- | --- | --- | --- |
| 1 | Token com App ID, App secret e instance | 200, `expires_in` 14400, instance igual | Passou. |
| 2 | `GET /apps/v1/instance` | Site Teste Detox Pass, fuso `America/Sao_Paulo` | Passou. |
| 3 | Permissões da instance | Manage bookings, read calendar, ler dados básicos da instance | Passou, os três escopos da tabela acima. |
| 4 | Query de serviços | Os três `APPOINTMENT` da tabela | Passou. |
| 5 | Horários da Consultoria, 7 a 14 de outubro de 2026 | Livres, fuso de São Paulo, primeiro 10:00–11:00 | Passou, 90 horários. `locationType` `BUSINESS`. |
| 6 | Cofre da conexão `80f2abd0-664d-4f8f-b410-27b62426234c` | `appId`, `appSecret`, `instanceId`, `publicKeyPem`. Status `pending`. Fora da reserva | Passou. A Square segue `tested` e origem. |
| 7 | Ficha | Inativa. Therapeutic e Boston permanecem | Passou, leitura. Nada foi apagado. |
| 8 | Token sem instance, prova anterior | Serviços e instance recusam | 403, já registrado. O HTML de example.com não entrou no cofre. |
| 9 | Horários de Detox Facial e de Corporal Detox | A mesma forma da Consultoria, ou o erro da API | Ainda não rodou. |
| 10 | Criar na função publicada | `CREATED`, fora do calendário | Ainda não rodou. |
| 11 | Confirmar Detox Facial com `NOT_PAID` | `CONFIRMED` no calendário | Ainda não rodou. |
| 12 | Confirmar Consultoria ou Corporal sem carrinho | Se a Wix recusar, a recusa fica escrita e o ciclo não fecha nesses serviços | Ainda não rodou. |
| 13 | Reagendar e cancelar pela função publicada | Os dois lados iguais. Segunda chamada de cancelar não grava outro efeito | Ainda não rodou. |
| 14 | Leitura cruzada | `diverged` falso | Ainda não rodou. |
| 15 | Horário nascido só na Wix | O aviso responde 200 e não cria reserva | Ainda não rodou. |
| 16 | `scheduling-wix-webhook` sem JWT, e com JWT de outra chave | 401, nada gravado | Passou na URL publicada. GET 405. Corpo vazio: 401 `assinatura ausente`. Corpo sem JWT: 401 `assinatura inválida`. |
| 17 | JWT válido de id desconhecido | 200, nada gravado | Ainda não rodou. |
| 18 | Booking Updated no mesmo instante, e Booking Canceled repetido | Ignora. Sem segundo efeito | Ainda não rodou. |
| 19 | Agenda publicada | O cartão da Wix abre Connect with Wix. Sem serviço escolhido, o texto pede o login. Com serviço, fica salvo e `pending` | O botão está no código. A prova na tela publicada fica para o deploy. |
| 20 | Connect with Wix neste site | Abre a Wix, volta com instance assinada, mostra os três serviços, não grava sozinho | A função `scheduling-wix-oauth` existe. O clique desta conta ainda não rodou. |
| 21 | App unlisted | Se a Wix pedir `shareUrlId`, o id fica em secret do projeto | Ainda não rodou. |
| 22 | Disconnect | Apaga o cofre desta conexão. Não devolve o token. Não desinstala a app | Ainda não rodou. |
| 23 | Cliente chama gravar segredo | 403 | Ainda não rodou nesta função. A Wix ainda não tem essa ação. |
| 24 | Status depois do ciclo, ficha de volta a inativa | `tested` na Wix. Homologada falso. Square continua a origem, salvo a prova ter devolvido a origem no fim | Ainda não rodou. |

## Fora deste corte

- Marcar a Wix como homologada.
- Publicar a ficha Detox Pass na busca da cliente.
- Trocar a origem da Square por causa desta gravação.
- Mexer na reserva da Sarah Anderson.
- Reservar agenda externa pelo chat.
- Importar um horário que nasceu só na Wix.
- Cobrar pela Wix no lugar da cobrança da plataforma.
- Tratar o aviso de teste da Wix como reserva. Sem o id de uma reserva daqui, a função responde 200 e não grava.
