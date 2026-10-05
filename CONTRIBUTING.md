# Como contribuir — Detox Pass

Este guia vale para **todo mundo** que escreve código no Detox Pass: Samuel,
Elias, Anderson e qualquer agente de IA (Cursor). Ele é propositalmente simples,
então também serve para quem está começando.

Fontes de verdade:

- O **processo de engenharia** segue o
  [Playbook de Desenvolvimento do Detox Pass](./docs/playbook/Detox_Pass_Playbook_Desenvolvimento_Azvor_PT_v1.2.pdf).
- O **escopo funcional** (o que faz parte do produto) segue a Proposta Comercial
  Final, resumida em [`docs/PRODUCT_SCOPE.md`](./docs/PRODUCT_SCOPE.md).

Este arquivo é um resumo prático das regras mais importantes. Nunca use Bubble ou
Figma como justificativa para implementar algo fora do escopo final.

## As regras principais

1. **Nunca trabalhe direto na `main`.** A `main` é protegida e precisa ficar
   sempre estável e pronta para deploy. Ninguém faz push direto nela — nem
   Samuel, nem Elias, nem Anderson.
2. **Cada tarefa tem sua própria branch.** Branch curta, para uma tarefa pequena
   e coerente. Terminou e mergeou? Apague a branch.
3. **Padrão de nomes de branch:**

   | Prefixo      | Quando usar                                   | Exemplo                          |
   | ------------ | --------------------------------------------- | -------------------------------- |
   | `feat/`      | Nova funcionalidade                           | `feat/booking-reschedule`        |
   | `fix/`       | Correção de bug                               | `fix/stripe-webhook-idempotency` |
   | `chore/`     | CI, dependências, configuração                | `chore/github-actions`           |
   | `docs/`      | Documentação                                  | `docs/cursor-rules`              |
   | `refactor/`  | Reorganização sem mudar comportamento         | `refactor/scheduling-adapter`    |
   | `hotfix/`    | Correção urgente em produção                  | `hotfix/login-regression`        |

4. **Commits pequenos e claros.** Cada commit deve contar o que mudou. Use o
   formato `tipo(area): descrição`, por exemplo:

   ```
   feat(bookings): adiciona fluxo de reagendamento
   fix(payments): evita processar webhook duplicado
   docs(onboarding): explica configuração de ambiente
   ```

   Evite mensagens como "update", "final", "mudanças da IA" ou "arrumei".

5. **Toda mudança entra na `main` via Pull Request.** Nada de merge manual
   direto. O PR é o ponto onde o código é revisado.
6. **Todo PR precisa passar por revisão** de pelo menos uma outra pessoa antes do
   merge.
7. **Alterações críticas precisam de revisão de Samuel ou Elias.** Isso inclui:
   pagamentos (Stripe), autenticação, RLS, migrations, secrets e deploy de
   produção.
8. **Código gerado por IA (Cursor) também precisa de revisão humana.** A IA pode
   escrever o código, mas **não aprova o próprio código**. Velocidade de geração
   não substitui responsabilidade técnica.
9. **A prova é o app publicado.** Abra `https://detox-pass.vercel.app` depois
   do push, com a migration e a função já aplicadas no projeto `detoxpass`.
   `127.0.0.1`, Docker e `supabase start` não contam como aceite.
10. **Pagamento, estorno e repasse continuam desligados.** Não criar cobrança
    para simular um teste.

## Antes de abrir um PR

- Faça commit, push em `detoxpass/main`, `supabase db push --linked` e
  `supabase functions deploy` do que mudou.
- Confirme o fluxo em `https://detox-pass.vercel.app`.
- Confirme que **nenhum secret** (chave, token, senha, `.env`) foi incluído.
- Preencha o template de PR com o que foi feito, por que, como testar e os riscos.

Para o passo a passo completo do fluxo, veja
[`docs/DEVELOPMENT_WORKFLOW.md`](./docs/DEVELOPMENT_WORKFLOW.md).
