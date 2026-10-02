# Arquitetura — Detox Pass

> ⚠️ Este documento registra **apenas o que já sabemos** pelo playbook e pela
> Proposta Comercial Final. Ele **não** inventa arquitetura que ainda não foi
> definida. O setup técnico definitivo será feito no bootstrap inicial, liderado
> por Elias, e detalhes serão adicionados aqui à medida que as decisões forem
> tomadas. Para o escopo funcional, ver [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md).

## Stack de referência

| Camada             | Tecnologia                                                   | Observação                                   |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| **Frontend**       | React + TypeScript                                           | —                                            |
| **Backend / Banco**| Supabase / PostgreSQL                                        | Sujeito ao setup técnico inicial             |
| **Mobile**         | Capacitor para Android e iOS                                 | —                                            |
| **Hospedagem/Deploy** | Vercel                                                    | Conta deve ficar com a cliente (ver handover em [`DECISIONS.md`](./DECISIONS.md)) |
| **Pagamentos**     | Stripe / Stripe Connect                                      | Arquitetura final de payout só fecha após a POC (Fase 05) |
| **Integrações de agenda** | Acuity, Square, Wix, Zenoti, Mindbody                 | Isoladas em adapters, não espalhadas nas telas |
| **Agente de IA**   | Chat de descoberta (serviço/cidade/profissional)            | Provedor/modelo é **DECISÃO PENDENTE**       |

## Integrações externas

- **Agendas:** Acuity, Square, Wix, Zenoti, Mindbody. Cada provedor deve ficar
  isolado atrás de um **adapter de scheduling** que expõe um contrato interno
  (consultar disponibilidade, ler booking, criar, reagendar, cancelar, tratar
  webhook). Se um provedor não suporta uma operação, o adapter informa
  explicitamente — **não** simulamos capacidades que a API não oferece. Ordem de
  integração e ressalvas por provedor estão em [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md).
  **Nenhuma integração recebe status HOMOLOGADA sem teste autenticado.**
- **Pagamentos:** Stripe / Stripe Connect. Webhooks validam assinatura e são
  idempotentes. O status do frontend não é a fonte de verdade do pagamento.

## Fluxo de pagamento (conceitual)

O modelo é de **pagamento com liberação condicionada** (*conditional payment
release / delayed payout*) — **não** usar a expressão "escrow account".

```
Cliente → Stripe → pagamento confirmado
       → payout da profissional permanece PENDENTE
       → serviço acontece → cliente confirma
       → operação/regra do marketplace autoriza payout → profissional recebe
```

- Comissão inicial **20%**, tratada como **configuração do marketplace** (não
  constante no código).
- A profissional **não** pode liberar o próprio payout.
- A arquitetura **definitiva** só é fechada após a POC de Stripe Connect (Fase 05).
- Regras de acesso a dados financeiros via services/repositories, não queries
  cruas espalhadas pelas telas. Área de **alto risco** (revisão de Samuel/Elias).

## Agente de IA (chat de descoberta)

Ajuda a cliente a encontrar serviço, cidade e profissional usando **apenas dados
da plataforma** (catálogo, cidades, serviços, profissionais ativas). O agente
**não** inventa horários, não substitui a API de agenda, não cobra, não libera
payout, não decide pela cliente, não dá orientação clínica e não marca integração
não testada como homologada. Após a conversa: perfil da profissional →
disponibilidade real → booking normal → Stripe.

> **DECISÃO PENDENTE:** provedor e modelo de IA. Não escolher sem aprovação.

## Referências existentes (produto antigo)

- **Bubble** → referência **funcional e histórica**: fluxos, campos, regras de
  negócio e casos de borda.
- **Figma** → referência de **UX, telas e fluxos**: hierarquia de telas e
  navegação.

> **Identidade visual:** a implementação final terá uma **nova identidade
> visual** própria e aprovada. **Não copiar** cores, tipografia, logo, ícones ou
> layout antigos do Bubble/Figma sem validação. Em caso de conflito, vale a
> decisão mais recente aprovada por Samuel/Elias.

## Ordem de prioridade quando houver conflito

1. Decisão mais recente aprovada por Samuel/Elias e o escopo atual.
2. Nova identidade visual / design system aprovado.
3. Código e arquitetura high-code atuais.
4. Figma e Bubble legados (referência, não autoridade final).

## Decisões arquiteturais pendentes

> Esta seção existe para **Elias** preencher durante o bootstrap técnico. Liste
> aqui as decisões conforme forem tomadas, e registre a versão final também em
> [`DECISIONS.md`](./DECISIONS.md).

- [ ] Estrutura final de pastas do `src/` (confirmar o padrão por feature do playbook).
- [ ] Ferramenta de build/dev (ex.: Vite) e versão do React/TypeScript.
- [ ] Setup do design system (biblioteca de componentes, tokens, tema) e nova identidade visual aprovada.
- [ ] Projetos/contas Supabase por ambiente e estratégia de secrets.
- [ ] Hospedagem/deploy (Vercel) por ambiente, incluindo o ambiente de demonstração separado de produção.
- [ ] Padrão de acesso a dados (services / repositories / hooks).
- [ ] Estrutura de migrations e seeds.
- [ ] Modelo de autenticação e políticas de RLS iniciais.
- [ ] Arquitetura definitiva de Stripe / payout (só fecha após a POC da Fase 05).
- [ ] Provedor e modelo de IA do agente de chat.
- [ ] Estrutura final do Gusto (Fase 08, opcional).
- [ ] Configuração do Capacitor (Android/iOS) e pipeline de build mobile.

> Já **decididos** (não são pendência): repositório único com estrutura simples
> (sem monorepo) e **Acuity como primeira POC** de agenda. Essas pendências têm
> correspondência em [`DECISIONS.md`](./DECISIONS.md) na seção **Decisões
> pendentes**. Ao definir algo, registre a decisão lá.
