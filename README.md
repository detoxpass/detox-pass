# Detox Pass

Projeto desenvolvido pela **Azvor Tecnologia**.

## Sobre o projeto

O Detox Pass é um sistema de agendamento e marketplace de serviços com
pagamentos integrados. O objetivo é oferecer aos usuários uma forma simples de
descobrir provedores, agendar sessões, pagar e acompanhar recompensas, enquanto
os provedores gerenciam suas agendas e recebem através de uma estrutura de
pagamentos confiável e auditável.

O produto já existe hoje em uma versão feita no **Bubble** e possui telas no
**Figma**. Esta é uma **reconstrução em high-code**: começamos do zero com uma
base técnica profissional, usando o Bubble e o Figma apenas como referência.

## Arquitetura planejada (alto nível)

> Esta é a stack de referência definida no playbook. O setup técnico definitivo
> será feito no bootstrap inicial liderado por Elias.

- **Frontend:** React + TypeScript
- **Backend / Banco de dados:** Supabase / PostgreSQL (sujeito ao setup técnico inicial)
- **Mobile:** Capacitor para Android e iOS
- **Integrações externas:** APIs de agenda (Acuity, Square, Wix, Zenoti, Mindbody),
  Stripe / Stripe Connect e demais integrações definidas no projeto

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

- [Workflow de desenvolvimento](./docs/DEVELOPMENT_WORKFLOW.md) — o fluxo oficial do dia a dia.
- [Arquitetura](./docs/ARCHITECTURE.md) — o que já sabemos e o que ainda está pendente.
- [Onboarding](./docs/ONBOARDING.md) — como um novo desenvolvedor entra no projeto.
- [Decisões técnicas](./docs/DECISIONS.md) — registro das decisões já tomadas.

Veja também:

- [Como contribuir](./CONTRIBUTING.md) — regras de branches, commits e Pull Requests.
- [Playbook de Desenvolvimento do Detox Pass](./docs/playbook/Detox_Pass_Playbook_Desenvolvimento_Azvor_PT_v1.2.pdf)
  — documento oficial da Azvor, versionado no repositório. É a **fonte de verdade**
  do processo.
