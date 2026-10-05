# Workflow de desenvolvimento — Detox Pass

Este documento transforma o processo do playbook em uma referência prática para
o dia a dia. Se algo aqui conflitar com o Playbook de Desenvolvimento do Detox
Pass, o playbook vence.

## Fluxo oficial

```
Task
  → Implementação
  → Commit
  → Push em detoxpass/main
  → supabase db push --linked, se houve migration
  → supabase functions deploy, se houve função
  → Prova em https://detox-pass.vercel.app
```

A decisão de 2026-10-05 em [`DECISIONS.md`](./DECISIONS.md) vale: não há stack
local nem staging para aceite. Docker, `supabase start` e `127.0.0.1` não
entram no relatório.

## Ciclo de uma tarefa (passo a passo)

1. Implemente a tarefa.
2. Faça o commit e o push em `detoxpass/main`.
3. Aplique a migration com `supabase db push --linked` no projeto `detoxpass`.
4. Publique a função alterada com `supabase functions deploy`.
5. Espere o deploy do Vercel desse commit ficar pronto.
6. Exercite o fluxo em `https://detox-pass.vercel.app` e registre o que aconteceu.

> **Tamanho de PR:** prefira PRs que alguém entenda em ~20-30 minutos. Se a
> tarefa está enorme, divida verticalmente.

## Definition of Done

Uma tarefa não termina porque a tela "parece pronta". Ela termina quando os
itens aplicáveis abaixo foram cumpridos:

- [ ] Critérios de aceite atendidos.
- [ ] Código revisável, sem mudanças aleatórias fora da tarefa.
- [ ] TypeScript sem erros conhecidos.
- [ ] Lint aprovado.
- [ ] Migration aplicada com `supabase db push --linked` quando houve mudança de banco.
- [ ] Função publicada no projeto `detoxpass` quando houve mudança de função.
- [ ] Fluxo exercitado em `https://detox-pass.vercel.app` no commit que está no ar.
- [ ] RLS/permissões revisadas quando aplicável.
- [ ] Env vars/configurações documentadas (sem revelar valores secretos).
- [ ] Nenhum secret ou dado real sensível no repositório.
- [ ] PR aberto com explicação e passos de teste.
- [ ] Revisão obrigatória concluída nas áreas de médio/alto risco.

## Onde a prova acontece

| Peça | Endereço |
| ---- | -------- |
| App | `https://detox-pass.vercel.app` |
| Banco e funções | projeto Supabase `detoxpass`, ref `otddminugslmacdirual` |
| Git que o Vercel publica | `https://github.com/detoxpass/detox-pass`, branch `main` |

Não há segundo ambiente. A prova usa essas três peças depois do push.

Regras de deploy:

- O deploy do app sai do push em `detoxpass/main`.
- A migration entra com `supabase db push --linked`.
- A função entra com `supabase functions deploy`.
- Pagamento, estorno e repasse continuam desligados. Não inventar uma cobrança para “testar”.

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
- O resumo da entrega diz o que foi visto em `https://detox-pass.vercel.app`
  e o que o Supabase de produção respondeu.
