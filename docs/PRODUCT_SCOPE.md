# Escopo do produto — Detox Pass

Este documento é o **resumo técnico do escopo vendido**, derivado da Proposta
Comercial Final aprovada. Ele descreve **o que faz parte do produto** e serve de
referência para planejar tarefas. Ele **não** é código nem define arquitetura
definitiva — decisões técnicas em aberto estão marcadas como **DECISÃO PENDENTE**.

> **Fonte de verdade:** em caso de dúvida sobre escopo/funcionalidade, vale a
> Proposta Comercial Final e as decisões posteriores aprovadas por Samuel/Elias.
> Bubble e Figma são referência histórica, nunca justificativa para implementar
> algo fora deste escopo. Veja [`DECISIONS.md`](./DECISIONS.md) e
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Visão geral

O Detox Pass é um **marketplace de serviços** que conecta clientes a
profissionais, com **reserva de horários** (agenda real, integrada a provedores
externos), **pagamento no momento da reserva** com **liberação condicionada** do
repasse à profissional, **confirmação de atendimento**, **recompensas (rewards)**
e um **chat com agente de IA** para ajudar a cliente a encontrar serviço, cidade
e profissional.

## Cronograma e garantia

| Item               | Prazo                                              |
| ------------------ | -------------------------------------------------- |
| **Contrato total** | 6 meses                                            |
| **Desenvolvimento**| 3 primeiros meses                                  |
| **Garantia**       | 3 meses seguintes                                  |

Durante a garantia, as correções são publicadas **no mesmo repositório**.

## As 9 fases de desenvolvimento

### Fase 01 — Base, perfis e repositório
- Perfis: **cliente**, **profissional** e **operação**.
- Permissões separadas por perfil.
- Estrutura inicial do projeto.
- Banco Supabase.
- GitHub.
- Ambiente de **demonstração separado de produção**.
- **Comissão configurável** (não constante no código).

### Fase 02 — Catálogo
- Profissionais, especialidades, serviços, cidades.
- Agenda de origem (provedor de onde vem a disponibilidade).
- Histórico da cliente.
- **Chat / agente de IA** para ajudar a encontrar serviço, cidade e profissional.

### Fase 03 — POC Acuity (primeira integração autenticada)
Validar, de forma autenticada: disponibilidade, criar reserva, reagendar,
cancelar e **registrar as respostas da API**.

> ⚠️ Acuity **não** pode ser chamada de *homologada* antes dessa POC.

### Fase 04 — Reservas dentro da plataforma
- Escolha da profissional, horário real.
- Criação da reserva, cancelamento, reagendamento, histórico.

### Fase 05 — POC Stripe Connect
Validar: cobrança na reserva, comissão, payout pendente, confirmação, liberação
e a **arquitetura financeira final**.

> ⚠️ A arquitetura definitiva de payout só é considerada **fechada depois desta
> POC**.

### Fase 06 — Confirmação e repasse
- Fila de confirmações; a cliente confirma o atendimento.
- Repasse é autorizado; comissão separada.
- Estorno/cancelamento conforme regra aprovada.
- Relatórios de **pago, pendente e liberado**.
- **Rewards somente sobre atendimento confirmado**.

### Fase 07 — Demais agendas
Ordem atual de integração:

1. Acuity
2. Square
3. Wix
4. Zenoti
5. Mindbody

Ressalvas conhecidas por provedor:

| Provedor | Ressalva                                                          |
| -------- | ---------------------------------------------------------------- |
| Square   | Escrita depende de plano/permissão.                              |
| Wix      | Criação e confirmação podem ocorrer em etapas separadas.         |
| Zenoti   | Cancelamento precisa ser validado por causa da invoice.          |
| Mindbody | Produção exige onboarding/homologação do fornecedor.             |

> ⚠️ **Nenhuma integração recebe status HOMOLOGADA sem teste autenticado.**

### Fase 08 — Gusto (se a cliente optar)
- É **opcional**.
- **Não** substitui o Stripe no checkout.
- **Não** faz split automático da cobrança Stripe.
- Entra **depois da confirmação**.
- Pode realizar *contractor payment*.
- W-9, 1099 e tratamento fiscal dependem da cliente/contador.

### Fase 09 — Publicação e garantia
- Homologação, publicação, entrega do repositório, treinamento.
- Início dos 3 meses de garantia.

## Os 12 módulos oficiais

| #  | Módulo                          |
| -- | ------------------------------- |
| 01 | Painel                          |
| 02 | Reservas                        |
| 03 | Confirmações                    |
| 04 | Pagamentos                      |
| 05 | Repasses                        |
| 06 | Profissionais                   |
| 07 | Agenda da profissional          |
| 08 | Integrações                     |
| 09 | Clientes                        |
| 10 | Relatórios e Administração      |
| 11 | Rewards                         |
| 12 | Chat com agente de IA           |

> Não criar novos módulos oficiais sem decisão posterior aprovada.

## Chat / agente de IA

Faz parte do escopo. Ajuda a cliente a encontrar **serviço**, **cidade** e
**profissional**.

**Pode usar:** catálogo Detox Pass, cidade, serviços, profissionais ativas e
informações disponíveis na plataforma.

**Não deve:**
- inventar horários;
- substituir a API de agenda;
- cobrar;
- liberar payout;
- decidir pela cliente;
- fornecer orientação clínica;
- chamar uma integração de *homologada* quando ela não foi testada.

**Fluxo depois da conversa:**

```
Chat → perfil da profissional → disponibilidade real da agenda → booking normal → Stripe
```

> **DECISÃO PENDENTE:** provedor e modelo de IA do agente ainda **não** estão
> definidos. Não escolher sem aprovação. Ver [`DECISIONS.md`](./DECISIONS.md).

## Regras de pagamento

A cliente **paga no momento da reserva**. Fluxo conceitual:

```
Cliente → Stripe → pagamento confirmado
       → payout da profissional permanece PENDENTE
       → serviço acontece
       → cliente confirma
       → operação/regra do marketplace autoriza payout
       → profissional recebe
```

Regras:
- **Comissão inicial: 20%**, tratada como **configuração do marketplace** (não
  como constante espalhada pelo código).
- Terminologia: usar **"pagamento com liberação condicionada"** /
  *conditional payment release / delayed payout*. **Não** usar a expressão
  *"escrow account"*.
- A **profissional não pode liberar o próprio payout**.
- O status do frontend não é a fonte de verdade do pagamento; confirmar no
  backend/eventos Stripe.

## Rewards

- Vinculados a **atendimentos confirmados**. Sessão cancelada ou sem confirmação
  **não pontua**.
- Metas podem considerar: sessões confirmadas, retorno de clientes, avaliação,
  ocupação e regras definidas pela operação.
- Recompensas podem incluir: bônus, destaque, redução de comissão futura, selo.
- Rewards **não** substituem comissão, **não** liberam payout e **não**
  substituem o Stripe.

## Ambientes

| Ambiente                   | Para que serve                                  |
| -------------------------- | ----------------------------------------------- |
| **Local**                  | Computador de cada desenvolvedor.               |
| **Staging / Demonstração** | Testes e homologação (exigido pela proposta).   |
| **Production**             | Ambiente real.                                  |

O ambiente de **demonstração deve ser separado de produção**. Nunca usar
produção para desenvolvimento ou testes comuns.

## Propriedade e infraestrutura

A Proposta Comercial Final estabelece que pertencem à **Detox Pass / cliente**:
código, banco de dados e histórico. As contas de **GitHub, Supabase e Vercel**
devem ficar **na conta da cliente**, e domínio/produção **não** ficam retidos
pela Azvor.

> ⚠️ Há uma **PENDÊNCIA DE OWNERSHIP / HANDOVER** registrada em
> [`DECISIONS.md`](./DECISIONS.md): o repositório está hoje em `azvor-team` e a
> transferência precisa ser planejada por Samuel. **Não** mover nada
> automaticamente.

## Garantias e limites técnicos

- Nenhuma integração de agenda é **homologada** sem teste autenticado.
- A arquitetura final de payout só fecha **após a POC de Stripe Connect** (Fase 05).
- Capacidades de APIs externas não devem ser assumidas — se a documentação/
  credencial não comprova, marcar como **não suportado / pendente**.
- Itens em aberto (modelo de IA, biblioteca visual definitiva, arquitetura Stripe
  final, estrutura final do Gusto) são **DECISÃO PENDENTE** e não devem ser
  definidos sem aprovação.
