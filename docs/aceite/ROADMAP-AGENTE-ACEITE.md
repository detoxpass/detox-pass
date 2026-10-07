# Aceite do agente — 2026-10-06

Prova no app `https://detox-pass.vercel.app` e no projeto `detoxpass`.
Os testes sem modelo passaram no Deno: 19 do agente e 6 do horário.
A tela publicada é o commit `83d0f01`.

## O que a cliente fez na tela

Entrou como Cliente Demo, abriu `/chat` e pediu “Deep tissue in Boston”.
A volta listou David Rodriguez, Michelle Rose e Sarah Anderson, sem alargar
o recorte. Em Sarah, a tela pediu o serviço. Deep tissue em Boston devolveu
terça, 6 de outubro, das 10:00 às 17:00 no fuso de quem olha.

O toque das 17:00 criou a reserva `864e4629-bdc9-4acd-9f71-2f687ba5569a`,
`provider_confirmed`, `amount_cents` nulo. O recibo abriu
`/sessions/864e4629-bdc9-4acd-9f71-2f687ba5569a`. O segundo toque no mesmo
horário mostrou “That time is no longer open.” A cliente cancelou essa
reserva na página da sessão. A reserva de 12 de outubro
`274295a1-e64a-4981-8993-0ef9631919fb` continua `provider_confirmed`.

O aviso da cliente subiu de 11 para 12 na reserva e para 13 no cancelamento.
No banco, o mesmo fato gerou `reservation_reserved` e `reservation_received`.
`intent_opened` não gerou aviso.

Em 390px os três cartões ficam um embaixo do outro. Em 1100px ficam lado a
lado. O campo de mensagem fica abaixo da conversa.

A frase clínica já estava na conversa, com a resposta fixa e sem chamada de
modelo. Depois de recarregar, o recibo continuou na thread. As mensagens não
guardam token de horário e a tabela não tem coluna de áudio.

## O que a função publicada respondeu fora da tela

- “Front Partner”, inativa, não aparece na busca. A ficha dela volta vazia.
- “Dor nas costas” volta zero. Um uuid que não existe volta `unknown_ids` e
  zero profissionais.
- Deep tissue e Boston juntos devolvem só quem oferece os dois.
- A ficha pública traz foto, serviços, cidades, especialidades e modo de
  agenda. Não traz telefone, endereço, nascimento nem `profile_id`.
- A conta, mesmo com o id de outra pessoa no argumento, volta “Cliente Demo”.
- Domingo, 11 de outubro, na grade da Sarah, volta zero horários.
- Áudio `wav` é recusado antes da transcrição.
- JWT de profissional recebe “Only a client can book.” e não cria reserva.

## O que não foi exercido

O botão de gravar foi tocado no navegador e não devolveu texto. Não houve
transcrição de um áudio real. Áudio de 61 segundos e acima de 2 MB ficou no
teste Deno, não numa requisição publicada.

Não há profissional com agenda externa neste banco. O caminho “externa sem
credencial” não foi exercido numa ficha real. Nada de agenda externa foi
marcado como homologado.

A caixa da profissional não foi aberta. A policy de chat não tem papel de
operação, e continua sem conta de operação. Duas clientes não foram
confrontadas na tela para a thread alheia. O cartão não foi tocado até a
página da profissional. O modelo não foi provocado a pedir cancelamento.
