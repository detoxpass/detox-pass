# {{Nome do módulo}}

Data: {{AAAA-MM-DD}}. Decisão em [`DECISIONS.md`](../DECISIONS.md), seção
"{{título da decisão}}". A norma curta está em `spec/{{arquivo}}.md`.

A prova é o app publicado: commit em `detoxpass/main`, `supabase db push
--linked` se houver migration, `supabase functions deploy` se houver função,
e o fluxo em `https://detox-pass.vercel.app`. O resultado vai em
[`../aceite/ROADMAP-{{SLUG}}-ACEITE.md`](../aceite/ROADMAP-{{SLUG}}-ACEITE.md).

## Relatório do que existe hoje

| Peça | Estado | Como foi lido |
| --- | --- | --- |
| Tabela ou função | {{o que existe}} | {{banco do projeto detoxpass, ou só código}} |

## O que esta fase entrega

{{Duas ou três frases do resultado visível para cada papel.}}

## Quem faz o quê

| Ação | Cliente | Profissional | Operação |
| --- | --- | --- | --- |
| {{ação}} | {{sim, não, só a própria}} | | |

## Desenho

| Peça | O que é |
| --- | --- |
| Dados | {{tabelas, colunas, constraint, RLS}} |
| Funções | {{Edge Function, ação, quem pode chamar}} |
| Tela | {{rota, componente, estados vazio, carregando, erro}} |
| Segredos | {{nome do secret ou do cofre, nunca o valor}} |

## O que a referência pedia e esta fase não copia

- {{item do Figma, do Bubble ou do protótipo que fica fora, e por quê}}

## Entregas, em ordem

1. {{entrega}}
2. {{entrega}}

## Parâmetros de aceite

| # | Parâmetro | Esperado | Prova | Resultado em {{data}} |
| --- | --- | --- | --- | --- |
| 1 | {{o que se testa}} | {{HTTP, linha, texto}} | {{URL publicada, conta, projeto}} | Ainda não rodou. |
| 2 | Papel sem permissão chama a ação | 403, nada gravado | {{conta}} | Ainda não rodou. |
| 3 | Mesma chamada repetida | Sem segundo efeito | Contagem antes e depois | Ainda não rodou. |
| 4 | Estado final dos dados de prova | Igual ao de antes | Leitura no projeto detoxpass | Ainda não rodou. |

## Decisões abertas que a tela não fecha

- {{decisão}}. Até ela sair, {{o que a tela faz}}.

## Fora deste corte

- {{item}}
