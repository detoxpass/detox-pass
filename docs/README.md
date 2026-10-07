# Documentação

As bases do projeto ficam na raiz desta pasta: [escopo](./PRODUCT_SCOPE.md),
[decisões](./DECISIONS.md), [arquitetura](./ARCHITECTURE.md),
[workflow](./DEVELOPMENT_WORKFLOW.md), [onboarding](./ONBOARDING.md) e o
[playbook](./playbook/).

## Pastas

| Pasta | O que guarda |
| --- | --- |
| [`roadmap/`](./roadmap/) | O plano de cada módulo, com a tabela de parâmetros de aceite. Comece por [`ROADMAP.md`](./roadmap/ROADMAP.md). |
| [`aceite/`](./aceite/) | O que a produção respondeu em cada parâmetro, com commit e deploy. |
| [`relatorios/`](./relatorios/) | Leituras longas do estado do sistema, com data. |
| [`guias/`](./guias/) | Passo a passo de configuração externa. |
| [`templates/`](./templates/) | O prompt e os modelos para levar um módulo novo até a produção. |

## Roadmaps e aceites

| Módulo | Roadmap | Aceite |
| --- | --- | --- |
| Fases 01 a 04 | [ROADMAP-01-04](./roadmap/ROADMAP-01-04.md) | [aceite](./aceite/ROADMAP-01-04-ACEITE.md) |
| Agenda interna | [ROADMAP-AGENDA-INTERNA](./roadmap/ROADMAP-AGENDA-INTERNA.md) | [aceite](./aceite/ROADMAP-AGENDA-INTERNA-ACEITE.md) |
| Agendas externas | [ROADMAP-AGENDAS](./roadmap/ROADMAP-AGENDAS.md) e [plano](./roadmap/PLANO-AGENDA-INTEGRACOES.md) | [aceite](./aceite/ROADMAP-AGENDAS-ACEITE.md) |
| Square | [ROADMAP-SQUARE](./roadmap/ROADMAP-SQUARE.md) | Na tabela do roadmap e no aceite das agendas |
| Wix | [ROADMAP-WIX](./roadmap/ROADMAP-WIX.md) | Na tabela do roadmap |
| Notificações | [ROADMAP-NOTIFICACOES](./roadmap/ROADMAP-NOTIFICACOES.md) | [aceite](./aceite/ROADMAP-NOTIFICACOES-ACEITE.md) |
| Agente de IA | [ROADMAP-AGENTE](./roadmap/ROADMAP-AGENTE.md) | [aceite](./aceite/ROADMAP-AGENTE-ACEITE.md) |
| Painel da operação | [ROADMAP-ADMIN](./roadmap/ROADMAP-ADMIN.md) | Parâmetros e roteiro de provas no roadmap. Sem resultado escrito. |
| Stripe | [ROADMAP-STRIPE](./roadmap/ROADMAP-STRIPE.md) | Corte 1 validado em Sandbox. Connect e Transfer ainda não concluídos. |

## Módulo novo

Copie o bloco de [`templates/PROMPT-MODULO.md`](./templates/PROMPT-MODULO.md)
para o agente e preencha o pedido. Ele escreve o roadmap a partir de
[`ROADMAP-MODELO.md`](./templates/ROADMAP-MODELO.md), publica, prova em
produção e fecha o aceite a partir de
[`ACEITE-MODELO.md`](./templates/ACEITE-MODELO.md).
