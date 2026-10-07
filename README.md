# Detox Pass - 2026

Projeto desenvolvido pela **Azvor Tecnologia**.

## Sobre o projeto

O Detox Pass é um **marketplace de serviços** que conecta clientes a
profissionais, com **reserva de horários** em agenda real (integrada a provedores
externos), **pagamento no momento da reserva** com **liberação condicionada** do
repasse à profissional, **confirmação de atendimento**, **recompensas (rewards)**
e um **chat com agente de IA** que ajuda a cliente a encontrar serviço, cidade e
profissional.

O escopo completo (9 fases, 12 módulos, regras de pagamento, integrações e
limites) está em [`docs/PRODUCT_SCOPE.md`](./docs/PRODUCT_SCOPE.md).

O produto já existe hoje em uma versão feita no **Bubble** e possui telas no
**Figma**. Esta é uma **reconstrução em high-code**: começamos do zero com uma
base técnica profissional, usando o Bubble e o Figma apenas como referência.

### Cronograma

Contrato de **6 meses**: **3 meses de desenvolvimento** + **3 meses de garantia**.
O desenvolvimento é organizado em 9 fases (ver escopo).

## Fontes de verdade

| Fonte                        | Define                                                  |
| ---------------------------- | ------------------------------------------------------- |
| **Proposta Comercial Final** | O escopo comercial e funcional (o que foi vendido).     |
| **Playbook de Desenvolvimento** | O processo de engenharia (como o time desenvolve).   |
| **Nova identidade visual**   | Prevalece sobre Bubble e Figma no visual.               |
| **Bubble**                   | Referência funcional e histórica.                       |
| **Figma**                    | Referência de UX, fluxos e telas.                       |

Decisões posteriores aprovadas por Samuel/Elias prevalecem sobre as referências
antigas. **Nunca** use Bubble ou Figma como justificativa para implementar algo
fora do escopo final.

## Arquitetura planejada (alto nível)

> Esta é a stack de referência definida no playbook. O setup técnico definitivo
> será feito no bootstrap inicial liderado por Elias.

- **Frontend:** React + TypeScript
- **Backend / Banco de dados:** Supabase / PostgreSQL (sujeito ao setup técnico inicial)
- **Mobile:** Capacitor para Android e iOS
- **Hospedagem/Deploy:** Vercel
- **Pagamentos:** Stripe / Stripe Connect (arquitetura final definida após a POC)
- **Integrações de agenda:** Acuity, Square, Wix, Zenoti, Mindbody (isoladas em adapters)
- **Agente de IA:** chat de descoberta (provedor/modelo ainda não definido)

## Referências do produto antigo

- **Bubble** → referência **funcional e histórica**: fluxos, campos, regras de
  negócio e casos de borda que já existem no produto atual.
- **Figma** → referência de **UX, telas e fluxos**: hierarquia de telas, jornadas
  e navegação.

> ⚠️ **Importante:** Bubble e Figma têm a **identidade visual antiga** da marca.
> Cores, tipografia, logo, ícones e estilo visual **não** devem ser copiados como
> fonte final. A nova versão terá uma identidade visual própria e aprovada. Em
> caso de conflito, vale sempre a decisão mais recente aprovada por Samuel/Elias.

## Como instalar e executar

> 🚧 **Ainda não há aplicação neste repositório.** O bootstrap técnico (React +
> TypeScript, estrutura de pastas, Supabase base, etc.) será feito por Elias.
> Esta seção será preenchida com os comandos reais quando o projeto existir
> (instalação de dependências, scripts de desenvolvimento, build, etc.).

Até lá, para preparar seu ambiente e entender o processo, veja a documentação
abaixo.

## Documentação

Toda a documentação do projeto está na pasta [`docs/`](./docs):

- [Escopo do produto](./docs/PRODUCT_SCOPE.md) — resumo técnico do que foi vendido (fases, módulos, regras).
- [Workflow de desenvolvimento](./docs/DEVELOPMENT_WORKFLOW.md) — o fluxo oficial do dia a dia.
- [Arquitetura](./docs/ARCHITECTURE.md) — o que já sabemos e o que ainda está pendente.
- [Onboarding](./docs/ONBOARDING.md) — como um novo desenvolvedor entra no projeto.
- [Decisões técnicas](./docs/DECISIONS.md) — decisões tomadas, pendentes e ownership/handover.
- [Índice da documentação](./docs/README.md) — roadmaps, aceites, relatórios, guias e o template para módulos novos.

Veja também:

- [Como contribuir](./CONTRIBUTING.md) — regras de branches, commits e Pull Requests.
- [Playbook de Desenvolvimento do Detox Pass](./docs/playbook/Detox_Pass_Playbook_Desenvolvimento_Azvor_PT_v1.2.pdf)
  — documento oficial da Azvor, versionado no repositório. É a **fonte de verdade**
  do processo.
