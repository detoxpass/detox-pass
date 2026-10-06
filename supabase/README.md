# Banco portátil

As migrations em `migrations/` são a fonte do schema. Elas não carregam segredo, project ref nem usuário fixo. A prova aplica esse conjunto no projeto publicado `detoxpass`.

`private` fica de fora da Data API. Não adicione esse schema em `config.toml`.

## Aplicar em outra conta

```bash
supabase link --project-ref <ref-da-conta>
supabase db push
```

`db push` aplica só o que ainda não entrou naquela conta. Não rode SQL solto no editor como substituto disto. `supabase start` não é a prova: o aceite acontece no app publicado depois deste push.

`seed.sql` de propósito não insere dado de negócio. A comissão inicial de 20% está na migration, então toda conta nova já nasce com ela.

## Primeira operação

Depois que a pessoa existir em Authentication, rode `snippets/promote-operator.sql` no SQL editor daquela conta, com o e-mail dela. O snippet não entra no histórico de migrations.

## O que estas migrations fazem

1. Schemas `public` e `private`, papel lido de `app_metadata`.
2. Perfis cliente, profissional e operação.
3. Catálogo e agenda de origem, sem token.
4. Saga da reserva, histórico e confirmação.
5. Ledger append-only, eventos de webhook e comissão configurável.
6. Reward só para sessão confirmada.
7. Funções de comando: intenção, provedor, cobrança, pagamento, confirmação, repasse, cancelamento, compensação e retry.
8. Wrappers na API. Escrita financeira e de saga só com `service_role`. Cliente confirma. Operação autoriza o repasse. Profissional não autoriza.

O cron interno tenta reaplicar evento já gravado e ainda não lançado. Se a conta não tiver `pg_cron`, a função `retry_unapplied_payment_events` continua disponível para um agendador externo.

Objetos finais do Stripe Connect (repasse para a conta da profissional) e o provedor de IA continuam fora. A cobrança provisória é uma Checkout Session, com `metadata.booking_id`. O webhook só marca pago depois da assinatura válida. O chat devolve o catálogo e não chama modelo.

## Funções

| Função | JWT | Papel |
| --- | --- | --- |
| `commands` | sim | confirmar, autorizar repasse, papel, relatório, retry |
| `chat` | sim | busca no catálogo, sem horário e sem modelo |
| `scheduling-acuity` | sim | disponibilidade, reserva, reagendar, cancelar, gravar token |
| `stripe-charge` | sim | abre a sessão de pagamento da reserva já confirmada no provedor |
| `stripe-webhook` | não | assinatura Stripe, grava pago ou compensação |
| `scheduling-square` | sim | disponibilidade, reserva, reagendar, cancelar, gravar token |
| `scheduling-square-webhook` | não | aviso assinado da Square; sem a chave, recusa |
| `scheduling-wix`, `zenoti`, `mindbody` | sim | respondem pendente, sem simular sucesso |
| `gusto` | sim | desligado até a cliente optar |

Segredos desta conta, gravados com `supabase secrets set`, nunca no Git:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` a plataforma injeta na função.

