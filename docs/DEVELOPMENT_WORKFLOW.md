# Workflow de desenvolvimento — Detox Pass

Este documento transforma o processo do playbook em uma referência prática para
o dia a dia. Se algo aqui conflitar com o Playbook de Desenvolvimento do Detox
Pass, o playbook vence.

## Fluxo oficial

```
Task
  → Branch (a partir da main atualizada)
  → Desenvolvimento com Cursor
  → Testes locais (lint, typecheck, test, build)
  → Commit
  → Push
  → Pull Request
  → CI (verificações automáticas)
  → Code Review (revisão humana)
  → Merge na main protegida
  → Staging
  → QA humano (Anderson)
  → Aprovação
  → Production
```

Cada passo existe por um motivo: a branch isola o trabalho, o CI pega erros
mecânicos, a revisão pega problemas de lógica e segurança, o staging evita que a
produção vire laboratório e o QA humano confirma que o produto realmente
funciona para uma pessoa.

## Ciclo de uma tarefa (passo a passo)

1. Atualize a `main` local e busque a versão mais recente do GitHub.
2. Crie uma branch curta para uma tarefa coerente e pequena (veja padrões em
   [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
3. Implemente e faça commits lógicos e pequenos.
4. Rode as verificações locais disponíveis.
5. Faça push da branch e abra um Pull Request.
6. Corrija erros do CI e responda às revisões.
7. Valide em staging quando a mudança altera comportamento.
8. Faça o merge (squash quando apropriado) e apague a branch.

> **Tamanho de PR:** prefira PRs que alguém entenda em ~20-30 minutos. Se a
> tarefa está enorme, divida verticalmente.

## Definition of Done

Uma tarefa não termina porque a tela "parece pronta". Ela termina quando os
itens aplicáveis abaixo foram cumpridos:

- [ ] Critérios de aceite atendidos.
- [ ] Código revisável, sem mudanças aleatórias fora da tarefa.
- [ ] TypeScript sem erros conhecidos.
- [ ] Lint aprovado.
- [ ] Testes relevantes executados.
- [ ] Build concluído.
- [ ] Migration criada quando houve mudança de banco.
- [ ] RLS/permissões revisadas quando aplicável.
- [ ] Env vars/configurações documentadas (sem revelar valores secretos).
- [ ] Fluxo validado em staging quando aplicável.
- [ ] QA humano do Anderson executado quando a tarefa altera comportamento
      visível, booking, integração ou fluxo de negócio.
- [ ] Falhas do QA humano corrigidas e retestadas.
- [ ] Nenhum secret ou dado real sensível no repositório.
- [ ] PR aberto com explicação e passos de teste.
- [ ] Revisão obrigatória concluída nas áreas de médio/alto risco.

## Ambientes: local, staging/demonstração e production

| Ambiente                   | Para que serve                                           | Credenciais        |
| -------------------------- | -------------------------------------------------------- | ------------------ |
| **Local**                  | Desenvolvimento no computador de cada um.                | Teste              |
| **Staging / Demonstração** | Homologação, QA humano e demonstração antes da produção. | Teste              |
| **Production**             | Ambiente real, usado por usuários finais.                | Produção (secretos)|

> A Proposta Comercial Final exige um **ambiente de demonstração separado de
> produção**. Nunca use produção para desenvolvimento ou testes comuns.

Regras de deploy:

- Deploy de produção sai da `main`, nunca de uma branch aleatória.
- Mudanças de alto risco passam por staging antes da produção.
- Nunca testar payout/refund real pela primeira vez em produção.
- Crie tags/releases nos marcos importantes para ter um ponto de rollback.

## Classificação de risco (define a profundidade da revisão)

| Risco  | Exemplos                                                             | Regra de revisão                   |
| ------ | ------------------------------------------------------------------- | ---------------------------------- |
| Baixo  | UI, textos, componentes, ajustes visuais, listagens simples         | PR normal, revisão leve            |
| Médio  | Bookings, queries, regras de negócio, webhooks não financeiros, adapters de agenda | Revisão técnica antes do merge     |
| Alto   | Stripe, payout, refund, dispute, auth, RLS, service_role, migration, secrets, produção | **Samuel ou Elias** revisa obrigatoriamente |

## Processo de hotfix (produção quebrada)

1. Pare novos deploys se o problema puder piorar dados, pagamentos ou segurança.
2. Crie uma branch `hotfix/...` a partir do estado atual de produção/`main`.
3. Reproduza e identifique a **menor** correção segura.
4. Em pagamento, segurança ou dados, Samuel ou Elias revisa antes do deploy.
5. Rode CI e testes direcionados.
6. Faça deploy do hotfix, verifique a saúde de produção e registre o ocorrido.
7. Crie uma tarefa posterior para a causa raiz se o patch foi propositalmente mínimo.

## Como agir quando algo quebra

- **Primeiro estabilize, depois investigue.** Se produção quebrou, volte para uma
  release/commit conhecido antes de debugar com calma.
- **Banco:** use migration de correção ou plano de restauração. Nunca improvise
  SQL destrutivo em produção.
- **Registre o incidente:** o que aconteceu, o que foi feito e o próximo passo.

## IA ajuda a escrever, mas não aprova o próprio código

O Cursor e os testes automatizados procuram erros técnicos. Isso é ótimo e deve
ser usado. Mas:

- **A IA pode implementar; a IA não pode se autoaprovar.** Código de pagamentos,
  auth, RLS, migrations e webhooks gerado por IA precisa de revisão humana antes
  do merge.
- Quando o agente diz "todos os testes passaram", isso significa apenas que os
  checks executados passaram — **não** que uma pessoa testou o produto ponta a
  ponta.
- Quando uma mudança exigir validação funcional, o resumo deve sinalizar
  explicitamente: **"Aguardando QA humano do Anderson em staging"**.
