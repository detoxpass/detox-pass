# Roadmap — Gusto

Stripe cobra a cliente. A Detox Pass aplica as regras, o ledger e a autorização. O Gusto faz o contractor e o pagamento da profissional. Este corte não chama o Gusto e não move dinheiro.

## DONE

- Arquitetura definida: Stripe cobra, Detox Pass autoriza, Gusto paga.
- Schema privado preparado em `supabase/migrations/20261008170455_gusto_integration.sql`.
- Feature flag `GUSTO_ENABLED=false`.
- Client Gusto em `supabase/functions/_shared/gusto/`.
- Versão padrão da API `2026-06-15`, com override por `GUSTO_API_VERSION`. Header `X-Gusto-API-Version`.
- Scopes registrados: `contractors:manage`, `contractor_payment_methods:write` e `payrolls:run` (este só na POC de pagamento).
- Contractor service preparado, com chave `detox-contractor-<professional_id>`.
- Bank sync preparado, sem persistir número de conta.
- Payment service preparado e travado: retorna `not_configured` e não chama a API.
- `can_release_professional_payment` integrado à regra de dupla checagem.
- `authorize_payout` grava aprovação e não cria `payout_released`.

## BLOCKED / WAITING CLIENT

- Gusto Developer Organization.
- Application.
- Client ID.
- Client Secret.
- Demo Company UUID.
- Funding account e banco da empresa no Gusto.
- Dados reais da profissional para o POC.

## NEXT

- Configurar os secrets na Edge Function.
- Ativar `GUSTO_ENABLED`.
- Criar um contractor demo.
- Sincronizar o banco.
- Executar o POC de pagamento.

Nenhuma dessas etapas roda neste corte.
