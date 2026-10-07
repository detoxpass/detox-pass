# Aceite das agendas externas

Data: 2026-10-06. Prova no projeto detoxpass. A Square da ficha Detox Pass
ficou `tested` depois que a função publicada criou, reagendou e cancelou.
Nada foi homologado. A Sarah Anderson segue na agenda interna, sem conexão
externa. A reserva dela de 12 de outubro não foi mexida.

## Onde cada coisa ficou

| Peça | Estado |
| --- | --- |
| Migration `20261006044022_calendar_source_and_origins` | Aplicada. Uma origem por profissional. Reagendamento aceita os cinco provedores. |
| Conexões da Detox Pass | Square `tested` e `is_source`. Acuity e Wix `pending`, fora da reserva. |
| `scheduling-square`, `scheduling-acuity` e `scheduling-square-webhook` | Publicadas. A Acuity nomeia o provedor na abertura. |
| Formulário da profissional | Agenda lista Detox Pass, Square, Acuity, Wix, Zenoti e Mindbody. Só Detox Pass e Square conectam. Square pede ambiente e access token. |
| Signature key da Square | Gravada no projeto. Não está no Git. |
| Ficha Detox Pass | Voltou a inativa, sem serviço e sem cidade, com agenda externa. |
| Tela no site publicado | Provada em `https://detox-pass.vercel.app/agenda`, na conta da profissional. |

## Parâmetros e resultado

Os testes locais estão em `supabase/functions/_shared/square_test.ts`.
Rodaram com Deno, 9 passaram. O nono cobre a busca que não começa no passado.

| # | Parâmetro | Esperado | Resultado |
| --- | --- | --- | --- |
| 1 | HMAC da URL publicada mais o corpo `{"type":"booking.updated","event_id":"evt-1"}`, chave de teste | `+6XTcJuCwCwPU0qln2H3RfPbKmuErLklMDLvUScm7N8=` | Passou. |
| 2 | Mesma assinatura com barra no final da URL, ou com outra chave | Recusa. | Passou. |
| 3 | Assinatura vazia | Recusa. | Passou. |
| 4 | Ambiente `sandbox`, `production`, vazio e desconhecido | Sandbox e produção têm host. O resto não vira produção. | Passou. |
| 5 | Duração `1800000` ms, `0`, `60000` e texto | 30 minutos, e nulo nos outros. | Passou. |
| 6 | Dia `2026-10-07` em `America/New_York` | `2026-10-07T04:00:00Z` até `2026-10-08T04:00:00Z`. | Passou. |
| 7 | O mesmo dia em `America/Sao_Paulo` | `2026-10-07T03:00:00Z` até `2026-10-08T03:00:00Z`. | Passou. |
| 8 | `2026-10-08T02:30:00Z` em São Paulo | Data local `2026-10-07`. | Passou. |
| 9 | Mês `2026-10`, `2026-12` e `2026-13` | Outubro e dezembro cabem em 32 dias. O 13 é nulo. | Passou. |
| 10 | Lista de disponibilidade com item sem `start_at` | Só o horário válido. | Passou. |
| 11 | `booking.updated` cancelado, sem reserva local | Ignora. Não cria reserva. | Passou. |
| 12 | `booking.created` com reserva local | Ignora. A ida já criou. | Passou. |
| 13 | `CANCELLED_BY_SELLER` e `CANCELLED_BY_CUSTOMER` | Cancelam. | Passou. |
| 14 | Cancelamento com reserva já `cancelled` | Duplicado, sem segundo efeito. | Passou. |
| 15 | `ACCEPTED` com `start_at` uma hora depois | Reagenda. | Passou. |
| 16 | Mesmo instante com e sem milissegundos | Ignora. | Passou. |
| 17 | `ACCEPTED` sem horário, e evento `payment.updated` | Ignora. | Passou. |
| 18 | GET no webhook publicado | 405. | Passou, na URL publicada. |
| 19 | POST sem assinatura, e POST com assinatura falsa, com a Signature key gravada | Sem assinatura: 401 `assinatura ausente`. Assinatura falsa: 401 `assinatura inválida`. Assinatura válida de um aviso sem reserva: 200, ignorado. | Passou na URL publicada. |
| 20 | Unidade sandbox `LJRSHX3HCV3VV` | 200, nome Default Test Account, fuso `America/Anchorage`. | Passou, leitura direta na API. |
| 21 | Busca de 7 de outubro de 2026, variação Regular, membro Sandbox Seller | 32 horários. Os três primeiros 17:00, 17:30 e 18:00 UTC. | Passou na prova anterior, direto na API. 17:00 UTC é 9:00 em Anchorage. |
| 22 | Criar 17:00 UTC, reagendar 18:00 UTC, cancelar | 201 `ACCEPTED`, 200 no novo horário, 200 `CANCELLED_BY_SELLER`. Sem `service_variation_version`, 400. | Passou na prova anterior, direto na API. O cliente de prova foi apagado. |
| 25 | Cliente chama `connect` | 403. | Passou na função publicada. |
| 26 | Access token inválido | A Square recusa. | 401 `UNAUTHORIZED`. Não gravou. |
| 27 | Operação chama `preview` sem `professional_id` | 400. | Passou. |
| 28 | Profissional manda só ambiente e access token, conta com vários serviços | 200 `choose`, sem gravar. Unidade Default Test Account, pessoa Sandbox Seller, e a lista inclui Sessão Detox 30 min. | Passou. |
| 29 | Segunda chamada com a variação escolhida | 200, grava, `pending`, `homologated` falso. | Passou. O token não voltou na resposta. |
| 30 | `dates` com a ficha inativa | 404. | Passou. |
| 31 | `dates` de outubro de 2026 antes do ajuste | A Square recusou o dia 1, que já passou. | 400 `Bookings can only be made in the future`. |
| 32 | O mesmo mês depois do ajuste, ficha ativa só na prova | Dias a partir de hoje. Dia 1 de outubro vazio. | 200, 19 dias, o primeiro `2026-10-06`. Dia passado: 200 e zero horários. A ficha voltou a inativa. |
| 33 | Novembro, horário, criar, reagendar, cancelar e ler pela função publicada | Ciclo fechado e as duas pontas iguais. | `dates` 21 dias. Dia `2026-11-02`, 16 horários. Reserva `fa458a4d-ade7-4f87-a50d-68429ce9ffb4` `provider_confirmed`. Reagendamento 200. Cancelamento 200. Leitura: local e Square cancelados, `diverged` falso. |
| 34 | Status depois do ciclo | `tested` na Square. Ficha inativa, zero serviços, zero cidades. | Passou. Acuity e Wix continuam `pending`. |
| 35 | Agenda publicada, conta da profissional | Lista Detox Pass, Square, Acuity, Wix, Zenoti e Mindbody. Square aparece como a agenda ligada. | Passou. A reserva de prova de 2 de novembro aparece cancelada. |
| 36 | Acuity na mesma lista | A tela não abre formulário. | Passou. O texto diz que esta tela ainda não conecta. |
| 37 | Token inválido no formulário | A Square recusa e a frase cabe na tela. | Passou. "Square did not accept this access token." |
| 38 | Token válido, vários serviços | A tela pede a escolha e não mostra unidade nem pessoa, porque há uma de cada. | Passou. A lista tem cinco serviços, inclusive Sessão Detox 30 min. |
| 39 | Salvar Sessão Detox | O formulário some, o token não volta, a Square continua ligada. | Passou. A frase de sucesso nomeou o serviço. |
| 40 | Sarah Anderson | Agenda interna, ativa, zero conexões. | Passou, leitura. |
| 41 | Ficha da operação | Formulário da Square com status `tested`, token vazio, botão desligado até colar. Acuity continua `pending`. | Passou. Não enviei o token de novo por ali. A ficha segue inativa, sem serviço e sem cidade. |
| 23 | Acuity `/me`, calendários e tipos | 403, API só no plano Powerhouse. | Passou como recusa. Sem lista, sem criar. |
| 24 | Wix com App ID e App secret, sem instance | Bearer de 4 horas. Serviços e instance respondem 403. | Passou como recusa. O HTML de example.com não foi gravado. |

## O que este aceite não diz

A Square desta ficha passou pela porta publicada da cliente e pelo formulário
da Agenda. A Signature key está gravada. O teste que a Square mandou antes
disso voltou não autorizado, como esperado. O reenvio ainda não chegou.
Acuity, Wix, Zenoti e Mindbody continuam sem conexão por esta tela.
Nenhuma agenda está homologada. A ficha Detox Pass não fica na busca da cliente.

O salvamento pela tela, na versão que estava no ar, gravou `pending` de novo.
A variação era a mesma do ciclo que já tinha fechado, então o status voltou
para `tested`. Um salvamento seguinte da mesma variação mantém `tested`.
Trocar o serviço volta para `pending`.
