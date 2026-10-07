# Roadmap 1–4 — base, catálogo, Acuity e reservas

Data da auditoria: 2026-10-05.

Plano de execução das entregas 1 a 4 de [`ROADMAP.md`](./ROADMAP.md).
A norma continua em [`spec/`](../../spec/README.md) e em [`DECISIONS.md`](../DECISIONS.md).

Este corte entrega a cliente capaz de achar uma profissional, ver horário que
a Acuity devolveu, reservar, reagendar, cancelar e rever o histórico. A
operação administra o catálogo e a conexão da agenda. A profissional vê a
própria agenda em leitura.

Cobrança, payout, confirmação de atendimento, reward na tela, outras agendas,
Gusto, modelo de IA e Capacitor ficam fora. A reserva deste corte termina
`provider_confirmed` ou `cancelled`. Ela não é paga.

## Como ler

Cada tela nova lista os componentes, os quatro estados obrigatórios e o que
não pode aparecer. Cada automação lista o gatilho, a falha e o aceite. Tarefa
sem componente ou sem estado de erro não está pronta.

Estados obrigatórios, em todo módulo novo, como em [`spec/17-frontend.md`](../../spec/17-frontend.md):

| Estado | Componente | Quando |
| ------ | ---------- | ------ |
| Carregando | `LoadingBlock` | Pedido em curso. Ação principal desabilitada. |
| Vazio | `EmptyBlock` | A API respondeu e não há linha. Não preenche com exemplo. |
| Erro | `ErrorBlock` | A API falhou. Mostra a mensagem e uma tentativa de novo. |
| Sem permissão | `ForbiddenBlock` | Papel errado ou RLS recusou. Não mostra o dado. |
| Pendente | `PendingBlock` | A agenda respondeu `supported: false`. Diferente de vazio: a integração não está ligada, não é “não há horário hoje”. |

---

## 1. O que a auditoria achou além da regra

O banco e a função `scheduling-acuity` já cobrem escrita do catálogo, Vault,
intenção, criar, reagendar e cancelar. O app publicado não chama função
nenhuma. Isso já estava no plano anterior. Esta revisão fecha o que faltava
nomear.

### Contrato da agenda que a função ainda não cumpre

[`spec/11-integracoes.md`](../../spec/11-integracoes.md) pede seis operações.
Hoje `scheduling-acuity` tem quatro ações de produto mais o token:

| Operação da spec | No código | Neste corte |
| ---------------- | --------- | ----------- |
| Consultar disponibilidade | `availability` pede um dia e devolve `times` | Acrescentar os dias do mês (`availability/dates`), para o calendário não oferecer dia cego |
| Ler booking | Não existe | Ação `read` |
| Criar | `book` | Manter, com trava de horário duplicado |
| Reagendar | `reschedule` | Completar a compensação |
| Cancelar | `cancel` | Completar a compensação |
| Tratar webhook | Não existe | Função nova, idempotente |

Sem `read` e sem webhook, uma mudança feita direto na Acuity não aparece na
plataforma. A spec não obriga polling em todo provedor. Obriga não perder o
fato externo. Neste corte o caminho é webhook assinado. Onde o teste mostrar
que o webhook não está disponível, a operação ganha a ação `read` na reserva,
visível, e o status dessa capacidade fica `pending`. Não entra cron de
varredura antes dessa evidência.

### Corrida e divergência

- Dois cliques em reservar podem abrir dois appointments. Não há índice único
  de profissional + horário nas reservas que ainda seguram o slot.
- Se a Acuity reagenda ou cancela e o SQL seguinte falha, a função devolve
  500 e os lados ficam diferentes. No `book`, o cancelamento externo já é
  tentado. Em `reschedule` e `cancel`, não.
- `homologated` é coluna que a RLS deixa a operação gravar. A tela não oferece
  esse valor.
- Um profissional tem um `external_resource_id`. A Acuity usa isso como um
  `appointmentTypeID`. Vários serviços compartilham esse tipo até a POC
  mostrar o contrário.

### App

- Sem router. `App.tsx` usa `useState`. `vercel.json` só reescreve
  `/delete-account`.
- `nav.ts` não tem caminho. Sidebar e URL podem divergir.
- Não existe pasta `features/`. Não existe `LoadingBlock`, `EmptyBlock`,
  `ErrorBlock`, `ForbiddenBlock` nem `PendingBlock`.
- `Button` não recebe `disabled`. `Modal` confirma um texto e não carrega
  formulário. `Status` pinta um texto cru, sem mapa da saga.
- Login, cadastro e recuperação existem. Não mandam `redirect_to` e o app não
  lê o token da URL. `config.toml` local aponta para `127.0.0.1:3000` e não
  pode ser copiado para a produção.
- CI não faz typecheck nem build do app. Não sobe o banco antes de
  `supabase test db`.
- Não há operador real. O snippet ainda tem e-mail de exemplo.
- Nenhuma profissional da home tem linha em `schedule_connections`.

### O que não se reconstrói

Shell, hero, filtros da home, página da profissional no que ela já mostra
(foto, serviços, preços, cidade), conta, apagar conta, RLS do catálogo,
`open_booking_intent`, Vault, `set_app_role` criando ficha inativa, e o teste
Deno de horário em `supabase/functions/_shared/slot_test.ts`.

---

## 2. Componentes

Os que já existem permanecem: `AppShell`, `Sidebar`, `Header`, `MobileNav`,
`Logo`, `Icon`, `Button`, `Field`, `Modal`, `PageHead`, `Status`.

`Button` passa a aceitar `disabled` e `pending`. `Status` passa a receber o
código da saga e traduzir. `Modal` continua para confirmação destrutiva.
Formulário de reagendar não cabe nele: usa `Sheet`.

Componentes novos. Nenhum deles chama Acuity, Stripe ou Gusto. Quem chama a
Edge Function é o módulo da feature.

### Base, em `apps/web/src/ui.tsx`

| Componente | Faz | Não faz |
| ---------- | --- | ------- |
| `LoadingBlock` | Área com espera, sem dado falso | Não trava a navegação do shell |
| `EmptyBlock` | Título e texto quando a lista veio vazia | Não sugere profissional ou horário de exemplo |
| `ErrorBlock` | Mensagem da API e botão de tentar de novo | Não esconde 403 dentro de erro genérico |
| `ForbiddenBlock` | Explica que o papel não acessa | Não mostra registro alheio |
| `PendingBlock` | Diz que a agenda não devolveu o dado | Não desenha grade local |
| `Notice` | Sucesso ou aviso curto depois de uma ação | Não é a fonte do status da reserva |
| `SagaStatus` | Rótulos: reservada, cancelada, reagendada, intenção cancelada | Não usa “pago”, “pendente” ou “liberado”. Esses termos são do dinheiro, que não é deste corte |

Rótulos da saga neste corte, em inglês, como o resto do app:

| `saga_status` | Rótulo |
| ------------- | ------ |
| `intent` | Checking the time |
| `provider_confirmed` | Reserved |
| `cancelled` | Cancelled |
| `charge_created`, `paid`, `payout_released`, `compensation_required`, `compensated` | Não aparecem como fluxo. Se uma linha antiga existir, o rótulo é o código e a tela não oferece pagar nem liberar |

### Rotas, em `apps/web/src/shell/`

| Componente | Faz |
| ---------- | --- |
| `paths` em `nav.ts` | Cada item do menu ganha `path`. A sidebar, a navbar e o título leem a mesma lista |
| `RequireAuth` | Sem sessão, manda para `/` |
| `RequireRole` | Papel diferente vê `ForbiddenBlock`, não a tela do outro |
| `GuestOnly` | Sessão aberta não fica na tela de login |

### Catálogo da operação, em `apps/web/src/features/catalog/`

| Componente | Faz | Não faz |
| ---------- | --- | ------- |
| `UserTable` | Lista perfis que a operação pode ler. Troca papel chamando `commands` / `set_app_role` | Não escreve `user_metadata`. Não remove o próprio papel de operação |
| `ProfessionalForm` | Nome de exibição, ativo, foto | Não edita preço. Não é a página de conta |
| `PortraitPicker` | Escolhe um arquivo já existente em `apps/web/public/people` | Não faz upload e não abre bucket |
| `ServiceForm` | Nome, slug, preço em centavos e moeda no mesmo envio | Não grava um dos dois sozinho |
| `CityForm` | Nome e slug | Não inventa praça |
| `SpecialtyForm` | Nome e slug | Não vira filtro da home enquanto não houver vínculo |
| `LinkEditor` | Marca serviços, cidades e especialidades daquela profissional. Vários são permitidos: o banco já é muitos-para-muitos | Não cria horário |
| `CatalogList` | Lista com busca local. Abaixo de 640px vira ficha empilhada, não tabela cortada | Não pagina dado que a API não devolveu |

### Agenda, em `apps/web/src/features/scheduling/`

| Componente | Faz | Não faz |
| ---------- | --- | ------- |
| `ConnectionPanel` | Mostra provedor Acuity, appointment type numérico, status somente leitura | Não tem opção “marcar homologada” |
| `SecretField` | Envia `userId` e `apiKey` uma vez. Limpa os campos depois do sucesso | Não relê o token. Não coloca o valor em `localStorage` |
| `MonthDates` | Mês cujas datas vieram de `availability/dates` | Não marca dia que a API não devolveu |
| `SlotList` | Botões dos `time` devolvidos para o dia | Não aceita hora digitada |
| `SlotButton` | Alvo de toque de no mínimo 44px. Mostra o texto do horário como a API mandou | Não converte para um fuso de marketplace. O fuso oficial continua em aberto; o texto exibido é o da resposta |

### Reservas, em `apps/web/src/features/booking/`

| Componente | Faz | Não faz |
| ---------- | --- | ------- |
| `BookingPanel` | Na página da profissional: serviço dela, cidade dela, mês, dia, horários, confirmar | Não cobra. Não mostra “pago” |
| `ConfirmBooking` | Resume profissional, serviço, cidade, preço do catálogo só como informação, e o horário escolhido | O preço não vai no corpo do `book` |
| `SessionList` | Reservas da pessoa logada, conforme o papel | Não mistura cliente |
| `SessionDetail` | Status, ids, horário atual | Não tem botão de payout |
| `EventTimeline` | Eventos, com horário anterior e novo no reagendamento | Não é relatório financeiro |
| `RescheduleSheet` | Outro dia e outro slot reais, então chama `reschedule` | Não grava horário livre |
| `CancelDialog` | Usa `Modal`. Confirma e chama `cancel` | Não pergunta quanto estornar. Essa política está em aberto. O texto diz que o dinheiro não é tratado neste passo |
| `ReadBookingButton` | Operação pede `read` de uma reserva | Não existe para a cliente como sincronização silenciosa |

`BookingPanel` entra na página que já existe (`Home` / profissional). O hero
e os filtros da busca continuam. A página da profissional ganha este painel
abaixo dos serviços.

### Áreas que só ganham rota e estado vazio

Rewards, pagamentos da profissional, financeiro, ajustes, documentos e
reviews. Reviews usa `EmptyBlock` com o texto de que avaliações não são um
módulo. Nenhum componente novo de nota, estrela ou KPI.

---

## 3. Telas

Todas as telas autenticadas usam o shell atual. Mobile: navbar. A partir de
768px: sidebar. Título da página só no desktop, como já está.

| Rota | Papel | Componentes | Vazio | Pendente |
| ---- | ----- | ----------- | ----- | -------- |
| `/`, `/signup`, `/recover` | público | Login atual | — | — |
| `/auth/callback` | público | lê o token e redireciona | link inválido vira `ErrorBlock` | — |
| `/delete-account` | público | página atual, sem shell | — | — |
| `/find` | cliente | home atual | catálogo vazio | — |
| `/therapists/:id` | cliente | página atual + `BookingPanel` | profissional inativa: `EmptyBlock` | sem conexão ou sem token: `PendingBlock` no painel de horário. O resto da ficha continua |
| `/sessions` | cliente | `SessionList` | nunca reservou | — |
| `/sessions/:id` | cliente | `SessionDetail`, `EventTimeline`, `RescheduleSheet`, `CancelDialog` | id inexistente: `EmptyBlock` | reagendar quando a Acuity declarar não suportado: `PendingBlock` e os botões somem |
| `/rewards` | cliente, profissional | `EmptyBlock` | sempre, neste corte | — |
| `/agenda` | profissional | `SessionList` somente leitura | sem reserva | sem conexão na própria ficha: `PendingBlock` |
| `/payments` | profissional | `EmptyBlock` | sempre, neste corte. Sem ação de liberar | — |
| `/admin` | operação | atalhos para as rotas abaixo, sem número inventado | — | — |
| `/admin/users` | operação | `UserTable` | nenhum usuário além dela | — |
| `/admin/therapists` | operação | `CatalogList` | nenhuma ficha | — |
| `/admin/therapists/:id` | operação | `ProfessionalForm`, `PortraitPicker`, `LinkEditor`, `ConnectionPanel`, `SecretField` | — | token ausente: `PendingBlock` dentro do painel |
| `/admin/services` | operação | `ServiceForm`, `CatalogList` | — | — |
| `/admin/cities` | operação | `CityForm`, `CatalogList` | — | — |
| `/admin/specialties` | operação | `SpecialtyForm`, `CatalogList` | — | — |
| `/admin/booking` | operação | `SessionList`, `ReadBookingButton` | nenhuma reserva | — |
| `/admin/booking/:id` | operação | detalhe, cancelar, reagendar, `read` | — | — |
| demais itens do menu | operação | `EmptyBlock` ou `ForbiddenBlock` | reviews explica que está fora | — |

A conta (`/account`) permanece a tela atual para os três papéis. Serviço,
preço, cidade e agenda não entram nela.

Menu da operação neste corte, além dos destinos que já existem no shell:
Serviços, Cidades e Especialidades passam a ter rota. Eles cabem no More do
mobile. Não são módulo novo: são o catálogo, módulo 06.

---

## 4. Automações

Automação aqui é o que acontece sem a pessoa repetir o clique para o
invariante se manter: CI, redirect de auth, compensação na mesma requisição,
webhook e a trava de horário. Não há cron de agenda neste corte.

| ID | Automação | Gatilho | Comportamento | Se falhar | Aceite |
| -- | --------- | ------- | ------------- | --------- | ------ |
| A1 | CI do app | pull request e push na `main` | typecheck e `npm run build` em `apps/web` | o check fica vermelho | erro de tipo não fica verde |
| A2 | CI do banco | o mesmo workflow | sobe o stack local e roda `supabase test db`; em seguida `deno test` de `slot_test.ts` | se o stack não subir, o job falha. Não marca sucesso sem ter rodado | invariante quebrada não entra |
| A3 | Redirect de auth | cadastro e recuperação | `redirect_to` na origem publicada. `/auth/callback` troca o token por sessão e limpa a URL | link expirado mostra `ErrorBlock` e não abre o app | o link recebido não usa `localhost` nem `127.0.0.1:3000` |
| A4 | Trava de slot | `open_booking_intent` | índice único parcial em `(professional_id, starts_at)` onde o status ainda segura o horário (`intent`, `provider_confirmed`). Cancelada sai do índice | a segunda intenção do mesmo horário falha e a Acuity não é chamada | dois cliques não criam dois appointments |
| A5 | Revalidação | `book` e `reschedule`, antes da escrita externa | `ensureSlotOpen`, que já existe | horário sumiu: 422, intenção local cancelada no `book`, reagendamento não aplica | a tela volta para `SlotList` com o erro, sem reserva nova |
| A6 | Compensação do criar | Acuity criou e `mark_provider_confirmed` falhou | pede cancelamento na Acuity e grava o desfecho em `booking_events` | se o cancelamento externo também falhar, a reserva fica `compensation_required` e a tela não diz reservada | não há sucesso com appointment órfão sem registro |
| A7 | Compensação do reagendar | Acuity mudou a hora e `mark_rescheduled` falhou | tenta devolver o horário anterior na Acuity; se não der, grava `compensation_required` | a tela mostra a falha, não “reagendada” | `from_starts_at` e `to_starts_at` só existem quando o SQL gravou |
| A8 | Compensação do cancelar | Acuity cancelou e `mark_cancelled` falhou | repete o `mark_cancelled`. Não marca sucesso antes disso | a tela mostra a falha | status local `cancelled` só com o externo aceito, ou falha explícita dos dois |
| A9 | Webhook Acuity | POST da Acuity na função `scheduling-acuity-webhook` | confere a assinatura. Idempotente por id externo + tipo do evento. Cancelamento externo chama `mark_cancelled`. Reagendamento externo chama `mark_rescheduled` com os dois horários | assinatura inválida: 401, sem gravação. Evento repetido: 200 sem segundo efeito | o segredo do webhook fica nos secrets da função. Não entra no Git nem na resposta |
| A10 | Leitura sob demanda | operação clica `ReadBookingButton` | `read` busca o appointment e mostra se a plataforma e a Acuity divergem | Acuity sem essa leitura: `supported: false`, status da capacidade `pending` | a cliente não dispara varredura. Não há cron varrendo a conta inteira |
| A11 | Promoção de papel | operação confirma em `UserTable` | `commands` / `set_app_role`. Profissional nasce `active = false` | erro da função aparece em `ErrorBlock` | a ficha inativa não entra na home |
| A12 | Fallback do Vercel | qualquer rota do app | rewrite para `index.html` | rota de arquivo real (`/brand`, `/people`) continua arquivo | recarregar `/therapists/:id` não devolve 404 do host |

A9 só vai para o ambiente depois que a credencial de teste conseguir registrar
a URL do webhook. Se a conta de teste não tiver webhook, A9 fica no código,
desligada, e o relatório da POC marca essa operação como `pending`. A10 cobre
o intervalo.

Segredos deste corte, só nos secrets da Edge Function:

- token da Acuity, por profissional, no Vault, não nesta lista;
- segredo de assinatura do webhook, se a POC confirmar que a Acuity assina.

Não entram `STRIPE_SECRET_KEY` nem `GUSTO_ENABLED`.

---

## 5. Backend que ainda precisa de código

| Peça | Mudança | Migration? |
| ---- | ------- | ---------- |
| Dias disponíveis | Ação `dates` em `scheduling-acuity`, chamando a disponibilidade mensal da Acuity e devolvendo só as datas da resposta | não |
| Ler booking | Ação `read`. Operação, ou a cliente dona da reserva. Devolve o estado externo ou `supported: false` | não |
| Webhook | `supabase/functions/scheduling-acuity-webhook`. Sem JWT de usuário. A autenticação é a assinatura | não, até precisar de tabela de evento |
| Idempotência do webhook | Se um evento repetido não puder ser reconhecido só pelo id externo e pelo status já gravado, uma tabela `private.calendar_events` guarda a chave do evento. `authenticated` não lê | sim, só nesse caso |
| Trava de slot | Índice único parcial descrito em A4. `open_booking_intent` traduz violação para erro claro | sim |
| Compensação | A6–A8 dentro de `scheduling-acuity/index.ts`. Evento em `booking_events` com `origin` | não, as colunas já existem |
| Status da conexão | A tela não grava `homologated`. Um update direto continua possível para quem tem SQL. A POC escreve `tested` por função nova `mark_connection_tested`, só `service_role`, chamada pelo relatório quando as quatro respostas existirem. A operação não tem dropdown | sim, a função |
| Deploy | Publicar `commands`, `scheduling-acuity` e, quando A9 existir, o webhook. JWT ligado nas duas primeiras | não |

Nada disso muda preço, comissão ou ledger.

---

## 6. Entregas

### Entrega 1 — Base

Tarefas:

1. Router e `path` em `nav.ts`. `RequireAuth`, `RequireRole`, `GuestOnly`.
2. Rewrite único no `vercel.json` para o SPA, preservando arquivos públicos.
3. `LoadingBlock`, `EmptyBlock`, `ErrorBlock`, `ForbiddenBlock`, `PendingBlock`, `Notice`, `SagaStatus`. `Button` com `disabled`.
4. `/auth/callback`. `signUp` e `recover` enviam `redirect_to`.
5. No projeto publicado, `site_url` e a lista de redirect passam a incluir a origem do app. `config.toml` local fica em `127.0.0.1`.
6. CI: A1 e A2. `CODEOWNERS` passa a citar `apps/web` além de `supabase/`.
7. Rodar o snippet do operador com o e-mail real, fora do Git.

Aceite da entrega 1:

- Recarregar `/therapists/:id`, `/sessions/:id` e `/delete-account` abre a mesma tela. A última segue sem shell.
- URL de outro papel mostra `ForbiddenBlock`.
- Sair e abrir de novo a URL interna não mostra a sessão anterior.
- Link de recuperação abre o app publicado.
- A pessoa operadora entra no menu da operação.
- Uma cliente recebe erro ao inserir em `services`.
- O CI vermelho bloqueia tipo quebrado e build quebrado.

Staging continua decisão de Samuel. Teste autenticado da Acuity não estreia
na produção. Sem o segundo projeto aprovado, a entrega 3 para antes da
credencial real e o motivo fica no relatório da POC.

### Entrega 2 — Catálogo

Tarefas:

1. `features/catalog` com as telas de usuários, profissionais, serviços, cidades e especialidades.
2. `UserTable` chama `commands`. Publicar a função se o projeto ainda não a tiver.
3. `ServiceForm` manda `price_cents` e `currency` juntos. A RLS e o check `services_price_pair` já recusam o par incompleto.
4. `LinkEditor` grava os três vínculos. Vários serviços e várias cidades na mesma profissional.
5. `PortraitPicker` só lista `public/people`.
6. Ativo e inativo. Inativa some da home. Histórico futuro não é apagado: inativar não dá `delete` na profissional que já tiver reserva.
7. Estados dos quatro tipos em cada lista. Abaixo de 640px, ficha empilhada. Alvo de 44px nos controles.

Aceite da entrega 2:

- A operação muda o preço e a home mostra o preço novo para toda profissional daquele serviço.
- A cliente não atualiza `services`, `professionals` nem vínculos.
- Promover usuário cria ficha `active = false`, invisível na busca.
- A profissional não acha preço, ativação nem agenda na página de conta.
- Especialidade sem vínculo não aparece como filtro da home.
- Foto sem caminho próprio continua no fallback já usado (`/people/splash.jpg`) e a ficha da operação mostra que não há foto própria.

### Entrega 3 — Acuity

Tarefas:

1. `ConnectionPanel` e `SecretField` na ficha da operação.
2. `store_secret` como já está: só operação, Vault, resposta sem o segredo.
3. Ações `dates` e `read`.
4. A6, A7 e A8.
5. A4, a trava de slot.
6. Função `mark_connection_tested`.
7. Publicar `scheduling-acuity`.
8. Com credencial de teste, no staging: disponibilidade de um dia, dias de um mês, criar, reagendar, cancelar, `read`. Guardar os corpos sem token e sem dado de cliente real.
9. Webhook A9 se a conta de teste registrar a URL. Senão, deixar A9 pendente e A10 visível para a operação.

Aceite da entrega 3:

- Sem token, `dates` e `availability` respondem pendente e `MonthDates` não marca dia.
- Cliente não grava conexão. `select` público não devolve segredo.
- As respostas arquivadas são da API autenticada. Mock não conta.
- Status na tela não tem “homologada” para clicar. `tested` só depois das respostas.
- Se a resposta mostrar um appointment type por serviço, a entrega 4 não começa. Entra coluna ou tabela de tipo por serviço, aí sim a cliente escolhe horário. Se a resposta mostrar um tipo por profissional, segue o `external_resource_id` atual.
- Credencial ausente ou staging ausente: a tela e a função existem, o teste autenticado não roda em produção, e isso está escrito.

### Entrega 4 — Reservas

Tarefas:

1. `BookingPanel` na página da profissional. Serviço e cidade limitados aos vínculos dela.
2. `MonthDates` e `SlotList` com o texto cru do horário.
3. `ConfirmBooking` chama `book`. Botão `pending` durante o pedido. A4 segura o duplo clique no servidor.
4. Sucesso: `Notice` de reservada e id interno. Texto de que o pagamento não é este passo. `amount_cents` segue nulo.
5. Horário que sumiu: `ErrorBlock` e volta à lista, sem reserva `provider_confirmed`.
6. `/sessions` e `/sessions/:id` com `EventTimeline`.
7. `CancelDialog` e `RescheduleSheet` para a cliente dona e para a operação. A profissional não recebe esses componentes.
8. `/agenda` somente leitura.
9. `/admin/booking` com `ReadBookingButton`.
10. Intenção cancelada porque a agenda falhou aparece como cancelada, não como reserva válida.

Aceite da entrega 4:

- O horário exibido estava no JSON daquele dia.
- `provider_confirmed` tem `external_booking_id`. A tela diz Reserved, não Paid.
- A cliente não insere em `bookings`.
- Cancelar e reagendar acertam Acuity e banco, ou mostram a falha. Não há sucesso com um lado só.
- Reagendar mantém o mesmo id interno e o mesmo id externo. A timeline tem os dois horários.
- A profissional recebe 403 nessas ações e não vê reserva de outra.
- Não há botão de liberar repasse, de confirmar atendimento no lugar da cliente, nem de marcar pago.
- Recarregar o detalhe abre a mesma reserva.
- Em 390px o painel de horários cabe na largura e o botão de reservar não fica escondido atrás da navbar.

---

## 7. Testes

| Teste | Onde | Prova |
| ----- | ---- | ----- |
| Horário some entre leitura e escrita | `slot_test.ts`, já existente, mais um caso se `dates` entrar no helper | `slotIsOpen` falso não segue para criar |
| Cliente não insere reserva | `supabase/tests/database/invariants.sql`, já cobre permissão | continua verde |
| Segundo `open_booking_intent` no mesmo horário | teste de banco novo, depois de A4 | a segunda chamada erra |
| `set_app_role` para profissional | teste de banco | nasce ficha inativa |
| Operação grava serviço; cliente não | teste de banco, se ainda não houver | RLS |
| Compensação | teste da função com resposta externa simulada só no teste Deno, sem chamar a Acuity real | falha de SQL depois do “ok” externo não devolve sucesso |
| POC autenticada | roteiro manual no staging, evidência em `docs/` sem segredo | quatro operações mais `dates` e `read` |
| Telas | navegador, desktop e 390px | rotas, vazio, erro, pendente, reservar, cancelar, sem botão de payout |

O teste simulado da compensação não substitui a POC e não autoriza a palavra
homologada.

---

## 8. Ordem

```
Entrega 1
  componentes de estado, router, CI, callback de auth, operador
Entrega 2
  catálogo da operação em cima da RLS
Entrega 3
  conexão, dates, read, trava, compensação, deploy, POC no staging
  webhook se a credencial deixar
Entrega 4
  painel de horário, reserva, histórico, cancelar, reagendar, leitura dos outros papéis
```

A entrega 4 não começa com conexão sem nenhuma resposta autenticada. Sem
credencial, a cliente vê `PendingBlock` e não há o que aceitar na reserva.

## 9. Aceite do corte inteiro

| # | Parâmetro |
| - | --------- |
| 1 | As rotas da seção 3 recarregam na mesma tela. `/delete-account` continua pública e sem shell. |
| 2 | Toda tela nova tem carregando, vazio, erro e sem permissão. Horário tem também pendente. |
| 3 | Os componentes da seção 2 existem e são eles que compõem as telas. A página não fala com `acuityscheduling.com`. |
| 4 | A1 e A2 rodam no CI. |
| 5 | O e-mail de auth abre o app publicado. |
| 6 | Há uma conta `operacao`, e-mail fora do Git. |
| 7 | Preço, cidade, serviço, vínculo, foto e ativo mudam pela operação e aparecem na home. A cliente não grava. |
| 8 | Inativa não aparece na busca. Vários serviços e cidades na mesma ficha funcionam. |
| 9 | Token não está em tabela `public`, em resposta, em `localStorage` nem no bundle. |
| 10 | Sem credencial, o painel é `PendingBlock`. Nenhum horário digitado. |
| 11 | Com credencial de teste, dias, horários, criar, reagendar, cancelar e ler têm resposta real arquivada, sem segredo. |
| 12 | Webhook está aceito com assinatura e idempotência, ou está escrito como `pending` e a operação tem `read`. |
| 13 | Dois cliques no mesmo horário não criam duas reservas ativas. |
| 14 | Reserva criada: id interno, id externo, `provider_confirmed`, `amount_cents` nulo, rótulo Reserved. |
| 15 | Cancelar e reagendar acertam os dois lados ou exibem a falha. Timeline guarda os dois horários. |
| 16 | Profissional não cancela, não reagenda, não libera repasse. |
| 17 | Nenhuma agenda além da Acuity, e a Acuity só como homologada se Samuel ou Elias registrarem isso depois das evidências. |
| 18 | Em 390px e em desktop, reservar, cancelar e o catálogo da operação cabem na tela e o alvo de toque da ação principal tem no mínimo 44px. |

## 10. Fora deste corte

- Segundo projeto Supabase, até Samuel aprovar conta e custo.
- Appointment type por serviço, até a POC mostrar que um tipo por profissional não serve.
- Prazo, multa, estorno e o efeito de reagendar sobre dinheiro já capturado.
- E-mail de “reserva criada”. A spec não pede. O aviso é o `Notice` dentro do app.
- Cron varrendo appointments.
- Stripe, fila de confirmação, payout, reward, Square, Wix, Zenoti, Mindbody, Gusto, chat com modelo, Capacitor, upload de foto de catálogo, reviews e KPI.

## 11. Arquivos

| Área | Onde |
| ---- | ---- |
| Estado e botão | `apps/web/src/ui.tsx` |
| Rotas | `apps/web/src/App.tsx`, `apps/web/src/shell/nav.ts`, `vercel.json` |
| Auth no cliente | `apps/web/src/lib/supabase.ts` |
| Catálogo | `apps/web/src/features/catalog/` |
| Horário | `apps/web/src/features/scheduling/` |
| Reserva | `apps/web/src/features/booking/` |
| Página da profissional | `apps/web/src/screens/Home.tsx` recebe `BookingPanel`. Hero e filtros ficam |
| Função da agenda | `supabase/functions/scheduling-acuity/index.ts` |
| Webhook | `supabase/functions/scheduling-acuity-webhook/index.ts` |
| Trava e status testado | nova migration em `supabase/migrations/` |
| Testes | `supabase/tests/database/invariants.sql`, `supabase/functions/_shared/slot_test.ts` |
| CI | `.github/workflows/backend.yml`, `.github/CODEOWNERS` |
| Auth do projeto | configuração do projeto, não `config.toml` |
| Operador | snippet rodado no SQL editor, e-mail fora do Git |
| Evidência da POC | arquivo em `docs/` sem segredo, quando o teste existir |

Segredo, project ref novo e senha não entram neste arquivo.
