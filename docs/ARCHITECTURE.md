# Arquitetura — Detox Pass

> ⚠️ Este documento registra **apenas o que já sabemos** pelo playbook. Ele
> **não** inventa arquitetura que ainda não foi definida. O setup técnico
> definitivo será feito no bootstrap inicial, liderado por Elias, e detalhes
> serão adicionados aqui à medida que as decisões forem tomadas.

## Stack de referência

| Camada             | Tecnologia                                                   | Observação                                   |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| **Frontend**       | React + TypeScript                                           | —                                            |
| **Backend / Banco**| Supabase / PostgreSQL                                        | Sujeito ao setup técnico inicial             |
| **Mobile**         | Capacitor para Android e iOS                                 | —                                            |
| **Integrações**    | APIs externas de agenda, Stripe / Stripe Connect e demais integrações do projeto | Isoladas em adapters, não espalhadas nas telas |

## Integrações externas

- **Agendas:** Acuity, Square, Wix, Zenoti, Mindbody. Cada provedor deve ficar
  isolado atrás de um **adapter de scheduling** que expõe um contrato interno
  (consultar disponibilidade, ler booking, criar, reagendar, cancelar, tratar
  webhook). Se um provedor não suporta uma operação, o adapter informa
  explicitamente — **não** simulamos capacidades que a API não oferece.
- **Pagamentos:** Stripe / Stripe Connect. Webhooks validam assinatura e são
  idempotentes. O status do frontend não é a fonte de verdade do pagamento.

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
- [ ] Setup do design system (biblioteca de componentes, tokens, tema).
- [ ] Projetos/contas Supabase por ambiente e estratégia de secrets.
- [ ] Padrão de acesso a dados (services / repositories / hooks).
- [ ] Estrutura de migrations e seeds.
- [ ] Modelo de autenticação e políticas de RLS iniciais.
- [ ] Primeiro conector de agenda para POC.
- [ ] Setup de Stripe em modo de teste e webhooks de staging.
- [ ] Configuração do Capacitor (Android/iOS) e pipeline de build mobile.
- [ ] Decisão repo único vs monorepo (padrão é repo único; monorepo só com justificativa registrada).
