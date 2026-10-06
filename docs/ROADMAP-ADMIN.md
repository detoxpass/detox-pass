# Painel da operação

Data: 2026-10-06. Revisão no mesmo dia, depois da leitura cruzada do banco,
das funções e da tela publicada. A copy da interface continua em inglês.
A tela descrita aqui entrou no código em 2026-10-06. Os parâmetros de
aceite continuam sendo a prova: este texto não fecha política em aberto
e não marca nada como homologado.

A hierarquia continua a do repositório: a decisão mais nova em
[`DECISIONS.md`](./DECISIONS.md), depois a proposta, o playbook e a
identidade. Os módulos oficiais continuam sendo Painel, Reservas,
Confirmações, Pagamentos, Repasses, Profissionais, Agenda da profissional,
Integrações, Clientes, Relatórios e Administração, Rewards e Chat com
agente. Este arquivo não abre módulo novo.

## O que a primeira versão deixou passar

A primeira redação cobria catálogo, ficha curta, papéis, termos, relatório
e a regra de recompensa. A gestão avançada que o banco já sustenta ficou
de fora, e um ponto da tela atual contradiz a regra da cliente:

- O detalhe em `/admin/booking/:id` recebe `canChange`. Com a reserva em
  `provider_confirmed` e agenda ligada, a operação vê **Move this session**
  e **Cancel reservation**. Quem muda ou cancela a reserva da cliente é a
  cliente. A profissional não altera. A operação também não altera por
  essa tela.
- A operação já recebe aviso próprio: candidatura de parceiro, reserva
  cancelada, reserva movida, cobrança iniciada, pagamento registrado,
  reserva que precisa de revisão, reserva compensada, visita confirmada e
  repasse liberado. O sino do shell já abre `/notifications`. A home do
  painel não transforma isso em fila.
- A ficha de cadastro (`private.partner_applications`) guarda data de
  nascimento, telefone, endereço, Instagram, nota de especialidade e nota
  de cobertura. O aviso aponta para a ficha da profissional, e essa ficha
  não mostra esses campos. Falta uma função de leitura só da operação.
- Não havia a fila inversa dos termos: quem ainda não aceitou a versão
  vigente.
- Não havia a saúde do catálogo: serviço, cidade ou especialidade sem
  profissional, e profissional ativa sem serviço ou sem cidade.
- Não havia a mesa de agendas: todas as conexões, o estado, a ordem e a
  agenda interna, sem segredo.
- O módulo Clientes não tinha ficha. `list_accounts` já devolve e-mail,
  nome e papel, e a operação já lê o perfil da cliente.
- Mudar a comissão não reescreve o ledger já gravado. A cobrança lê
  `commission_bps` no momento em que o pagamento vira `paid`. A tela de
  ajustes precisa dizer isso.
- Outra operação pode rebaixar a última conta `operacao`. A função só
  impede a pessoa de tirar o próprio papel.

Favoritos não são tabela: moram no aparelho da cliente. O chat continua
visível só para a conta da conversa. Nenhum dos dois entra como gestão.

## O que este plano faz

O painel passa a operar o que já está no banco e nas funções, no mesmo
desenho da home, da ficha pública, da conta e do calendário. A gestão é
fila, ficha, filtro e controle. Cada número da home é uma contagem de
linha real.

Entram também duas mudanças pequenas de função, porque a tela sozinha não
segura a regra:

1. `list_partner_applications`, só `operacao`, devolve a ficha de cadastro
   já gravada, com nome e e-mail. Não grava preço, não publica a
   profissional e não recebe arquivo.
2. `set_app_role` recusa a troca que deixaria zero contas `operacao`.

## O que este plano não faz

- Não cria avaliação, nota, milha, selo, destaque nem fórmula de bônus.
  Reviews sai do menu. A rota antiga continua com a frase de que avaliação
  não é módulo.
- Não inventa variação, meta, gráfico nem “última sincronização”.
- Não liga Stripe, não define estorno, no-show, prazo de cancelamento nem
  o modelo final do objeto de pagamento.
- Não coloca botão de homologar agenda. `homologated` continua fora do
  formulário.
- Não deixa a operação confirmar presença, cancelar ou remarcar no lugar
  da cliente.
- Não deixa a profissional liberar o próprio repasse.
- Não publica a profissional ao concluir o onboarding. `active` continua
  sendo a operação.
- Não cria análise de documento nem upload. A ficha mostra o que o
  cadastro já gravou.
- Não usa gênero como filtro da busca pública. O valor informado no
  cadastro aparece só na ficha da candidatura.
- Não abre a conversa do agente de outra pessoa.
- Não apaga a conta de outra pessoa. `delete_own_account` continua na
  própria conta.
- Não cria código novo de recompensa. A policy até permite inserir regra,
  e nenhuma função lê outro `code` além de `confirmed_session`.
- Não troca o provedor de IA, não liga Gusto e não abre Stripe Connect.

## Como a tela deve parecer

Shell atual: lateral no desktop, barra de baixo no celular, cartão branco,
raio em torno de 22, ação na cor da marca, foto circular, inglês.

| Referência já no ar | O que o painel copia |
| --- | --- |
| Home | Cartão de lista, estado vazio curto, contagem só do que existe. |
| Ficha da profissional | Cabeçalho com foto, nome e uma linha de estado. |
| Conta | Um cartão por assunto, rótulo no campo, salvar no fim do cartão. |
| Agenda | Controle segmentado, detalhe em cartão, legível em 390px. |
| Integrações | No celular o cartão empilha marca, nome, estado, texto e botão na largura. |

Cada página tem carregando, vazio, erro e sem permissão. Cliente e
profissional em `/admin` caem em `/forbidden`.

Em 390px a barra de baixo tem cinco entradas. Filtro, fila e ficha
empilham. Tabela vira lista. Nada estoura a largura.

| Barra | Abre |
| --- | --- |
| Home | `/admin` |
| People | profissionais, clientes e contas |
| Reservations | lista, filas e detalhe |
| Money | relatório e ajustes |
| More | catálogo, agendas, termos, recompensa |

No desktop a lateral mostra os mesmos grupos já abertos: Professionals,
Clients, Accounts, Reservations, Calendars, Services, Cities, Specialties,
Financial, Settings, Terms, Rewards.

O sino que já existe continua. A home repete os não lidos dessa conta de
operação, com o `href` que o aviso já gravou. Não há uma segunda caixa.

## Relatório do que existe hoje

Ambiente: código em `main` e o projeto `detoxpass`. A interface publicada
está em `https://detox-pass.vercel.app`. Este relatório é capacidade e
defeito atual. Não é o aceite da tela nova.

### Já está no banco ou na função

| Capacidade | Onde | Quem |
| --- | --- | --- |
| Comissão 0–10000 e moeda ISO | `marketplace_settings` | `operacao` lê e grava. A cobrança lê a comissão ao marcar `paid`. |
| Catálogo e preço com moeda | cidades, especialidades, serviços | `operacao` insere, atualiza e apaga |
| Ficha da profissional | nome, bio, foto, ativo, fuso, duração, modo | `operacao` atualiza |
| Vínculos | serviço, cidade, especialidade | `operacao` |
| Grade e bloqueio | `professional_hours`, `professional_blocks` | a própria profissional e `operacao` |
| Ordem das agendas | `calendar_order` | a profissional grava a própria; `operacao` lê |
| Passos de perfil e agenda | `professional_steps` | `operacao` lê |
| Conexão sem segredo | `schedule_connections` | `operacao` lê, inclui `status`, `is_source` e `external_resource_id` |
| Termos | rascunho, publicar, aceites | `operacao` |
| Contas | `list_accounts`: id, e-mail, nome, papel | só `operacao` |
| Papel | `set_app_role` | `operacao`; a pessoa não tira o próprio papel de operação |
| Relatório | `finance_report` | só `operacao` e serviço |
| Repasse | `authorize_payout` | só `operacao` e serviço, com presença, saga `paid` e `payout_pending` |
| Recompensa | `reward_rules`, `reward_grants` | `operacao` liga a regra e vê as concessões |
| Reservas, eventos, presença | `bookings`, `booking_events`, `attendance_confirmations` | `operacao` lê, inclusive nome da cliente em `profiles` |
| Avisos | `notifications` | cada operação lê os próprios, inclusive `partner_applied` |
| Cadastro de parceiro | `private.partner_applications` | só `service_role`. A operação ainda não lê |

Saga, cancelamento, reagendamento e compensação seguem em `service_role`.
O ledger não é lido pela API. O número financeiro sai de `finance_report`.

### O que a tela faz hoje

| Rota | Hoje |
| --- | --- |
| `/admin` | Frase de que a página não inventa número, e quatro atalhos. |
| `/admin/therapists` e `/:id` | Lista, nome, ativo, foto fixa, vínculos, tipo Acuity, token sandbox da Square. Sem bio, grade, passos, ordem nem ficha de cadastro. |
| `/admin/services`, cidades, especialidades | Criar. Sem editar e sem apagar. |
| `/admin/users` | Lista e promove cliente para profissional, oculta. |
| `/admin/terms` | Rascunho, publicar, versões e aceites. A tabela estoura no celular. Sem a lista de quem falta aceitar. |
| `/admin/booking` e `/:id` | Lista e linha do tempo. **O detalhe oferece mover e cancelar** quando `canChange` está ligado. Também oferece Check the calendar. |
| `/admin/financial`, `/admin/gamification`, `/admin/settings` | Página vazia. |
| `/admin/reviews`, `/admin/docs`, `/support` | Página vazia de propósito. |
| `/notifications` | Já abre para a operação. A home do painel não usa esses avisos como fila. |

## Regras da gestão

1. Preço e moeda viajam juntos. Serviço sem os dois não salva.
2. Comissão é inteiro de 0 a 10000. A tela mostra porcentagem e grava
   pontos-base. 2000 é 20%.
3. Trocar a comissão vale para a próxima cobrança que chegar a `paid`.
   Linha já presente em `finance_report` permanece.
4. Trocar o preço do serviço não altera `amount_cents` de reserva já
   gravada.
5. Ativar exige ao menos um serviço e uma cidade. Sem os dois o controle
   fica desligado e a frase diz o que falta. Ficha que já esteja ativa
   sem vínculo mostra o alerta e continua ativa até a operação desmarcar.
6. Concluir perfil, agenda e termos não marca `active`.
7. Promover cliente cria ficha oculta.
8. A operação não confirma presença, não cancela e não remarca. O detalhe
   da reserva no painel usa leitura. Check the calendar permanece.
9. Liberar repasse só habilita com presença confirmada, saga `paid` e
   `payout_pending`. Fora disso o botão fica desligado, com a frase da
   função.
10. Sem `STRIPE_SECRET_KEY`, Financeiro mostra o relatório real ou o vazio.
    Não desenha faturamento.
11. Status de conexão na tela: pendente, testado ou não suportado.
    Homologada não é opção. `is_source` aparece como dado, e a prioridade
    que a cliente usa é `calendar_order`.
12. Colar token de produção não entra. O campo da Square continua sandbox
    e não relê o valor.
13. A operação lê a ordem e não a grava no lugar da profissional.
14. Grade e bloqueio editados no painel são os daquela profissional.
15. Publicar termos cria versão imutável. Rascunho não muda o que a
    profissional aceita.
16. `confirmed_session` liga e desliga. Desligar não apaga concessão nem
    mexe no ledger. A tela não cria nem apaga regra.
17. Concessão não é dinheiro e não libera repasse.
18. A busca da cliente continua só com profissional ativa.
19. Token e webhook não aparecem em campo, lista, resposta nem bundle.
20. A fila de compensação é visível. Marcar compensada continua na função
    de serviço, até a política de estorno fechar.
21. Gênero do cadastro não entra em filtro de catálogo nem de busca.
22. A última conta `operacao` não pode ser rebaixada, nem por outra
    operação.
23. Nome e e-mail da cliente aparecem na ficha e na reserva da operação,
    porque `list_accounts` e a policy de perfil já devolvem. A agenda da
    profissional continua sem esse nome.

## Entregas

A ordem segue a dependência. O botão de repasse nasce desligado.

### 1. Casca, home e filas

Cinco entradas no celular e grupos abertos no desktop. Reviews e Docs
saem do menu. A home mostra contagens reais e um cartão por fila, cada
um abrindo a lista já filtrada:

| Fila | Conta |
| --- | --- |
| Aguardando publicação | `active = false` |
| Catálogo incompleto | sem serviço ou sem cidade |
| Termos em aberto | profissional sem aceite da versão publicada vigente |
| Agenda pendente | conexão `pending`, ou passo de agenda sem data |
| Precisa de revisão | saga `compensation_required` |
| Visita confirmada | presença gravada e saga ainda `paid` |
| Avisos | não lidos desta conta de operação |

Zero é zero. Não há porcentagem.

### 2. Catálogo com saúde

Criar, editar e apagar serviço, cidade e especialidade. Apagar com vínculo
mostra o erro do banco e a linha fica. Preço e moeda editam juntos. Slug
repetido mostra conflito.

Um cartão de saúde lista serviço sem profissional, cidade sem
profissional, especialidade sem profissional, profissional ativa sem
serviço ou sem cidade, e serviço cuja moeda difere da moeda da plataforma.
São listas, não um índice.

### 3. Ficha da profissional

Cartão de identidade: foto circular da lista atual, nome, bio, ativo.
Cartão de catálogo: vínculos e o preço do serviço, somente leitura nesse
cartão. Cartão de entrada: datas de perfil e agenda, e se a versão vigente
foi aceita. Cartão de candidatura: os campos da função nova de leitura.
Cartão de agenda: fuso, duração, modo, grade, bloqueios, ordem lida,
provedor, status, `is_source` e o id público do recurso. Sem segredo.

A Acuity continua com o id de tipo e o envio do segredo para a função. A
Square de sandbox permanece no formulário atual.

### 4. Clientes e contas

Contas: busca por nome e e-mail, filtro por papel. Promover cliente cria
profissional oculta. Trocar papel entre cliente, profissional e operação
usa `set_app_role`. A própria linha não oferece sair de operação. Se só
existe uma operação, o controle de rebaixar as outras some, e a função
recusa mesmo assim.

Cliente: nome, e-mail e as reservas em que ela é `client_id`. Sem
transcrição de chat e sem favoritos, porque favorito não está no banco.

Não há botão de apagar outra conta.

### 5. Reservas

Lista com filtro por saga, provedor, profissional, cidade, serviço e
período. Cada cartão mostra profissional, cliente, serviço, cidade,
intervalo, saga e a cor da agenda que recebeu.

O detalhe mantém a linha do tempo, a presença com data, o valor gravado
quando existe, a referência opaca de cobrança quando existe, e Check the
calendar. Não tem mover, cancelar nem confirmar presença. O botão de
repasse fica desligado até a função poder aceitar.

A fila `compensation_required` abre essa mesma lista filtrada. Não ganha
botão de compensar.

### 6. Mesa de agendas

Uma lista de todas as `schedule_connections`: profissional, provedor,
status, `is_source`, id público do recurso. Abrir a linha vai para a ficha.
A ordem daquela profissional aparece só leitura. Agenda interna sem linha
de conexão aparece pelo `schedule_mode` e pela grade.

Não se cria linha fictícia para Acuity, Wix, Zenoti ou Mindbody.

### 7. Financeiro e ajustes

Financeiro chama `finance_report`: uma linha por reserva, centavos
formatados, moeda, pago, comissão, pendente e liberado. O total é a soma
dessas linhas. Pendente zera onde já existe liberado, como a função faz.
Dá para filtrar por moeda e por profissional.

Ajustes grava comissão e moeda. O cartão diz que a comissão nova vale na
próxima cobrança que chegar a `paid`. Moedas diferentes entre plataforma
e serviço aparecem as duas.

### 8. Recompensa

Interruptor de `confirmed_session` e a lista de concessões, com link para
a reserva. Texto fixo: a concessão não escreve no ledger e não libera
repasse. Sem criar regra, sem apagar regra, sem selo.

### 9. Termos

O que já funciona entra no mesmo cartão. No celular a lista mostra data,
nome, e-mail, versão e superfície. IP, locale, agente e hash abrem no
detalhe da linha.

Uma segunda lista mostra profissionais sem aceite da versão publicada
vigente, com link para a ficha. Aceite de versão antiga não preenche essa
lista.

### 10. Leitura da candidatura

A função `list_partner_applications` lê `private.partner_applications` com
nome e e-mail. A ficha mostra data de nascimento, telefone, endereço,
cidade e região informadas, Instagram, nota de especialidade, nota de
cobertura e a data em que os termos daquele cadastro foram aceitos.
Publicar a profissional continua no checkbox `active`, com a regra do
catálogo. Não há edição desses campos neste corte: o cadastro é o que a
pessoa enviou.

## Parâmetros de aceite

Cada um é sim ou não, em `https://detox-pass.vercel.app`, com a conta de
operação. Cliente e profissional entram só onde o parâmetro pede.

| # | Parâmetro |
| - | --- |
| 1 | `/admin` recarrega no painel. Cliente e profissional em qualquer `/admin` caem em `/forbidden`. |
| 2 | No desktop a lateral abre People, Reservations, Calendars, Catalog, Money, Terms e Rewards. O item ativo é o da rota. |
| 3 | Em 390px a barra tem Home, People, Reservations, Money e More. More alcança catálogo, agendas, termos e recompensa. Nenhum rótulo é cortado. |
| 4 | Reviews não está no menu. `/admin/reviews` continua na frase de que avaliação não é módulo. |
| 5 | A home não mostra porcentagem, meta, gráfico nem “última sincronização”. |
| 6 | A home mostra as sete filas. Lista vazia mostra zero e abre a lista vazia correspondente. |
| 7 | O sino continua abrindo `/notifications`. O cartão de avisos da home usa as mesmas linhas não lidas e o `href` gravado. |
| 8 | Cada lista tem carregando, vazio e erro, sem stack. |
| 9 | Busca por nome e e-mail em contas acha a pessoa e não mistura outro papel quando o filtro está ligado. |
| 10 | Cidade nova aparece na lista e na ficha, e segue fora da busca enquanto nenhuma profissional ativa a usa. |
| 11 | Editar o nome da cidade grava e a ficha mostra o nome novo. |
| 12 | Apagar cidade sem vínculo some. Apagar cidade com vínculo mostra o erro e a cidade continua. |
| 13 | Especialidade segue criar, editar e apagar com e sem vínculo. |
| 14 | Criar serviço sem preço ou sem moeda não grava. |
| 15 | Editar preço sem repetir a moeda não grava. Os dois salvam juntos. |
| 16 | O preço gravado é o que a ficha pública da profissional ativa mostra. A cliente não envia valor. |
| 17 | Mudar o preço não altera o valor já gravado numa reserva existente. |
| 18 | Slug repetido mostra conflito e não duplica a linha. |
| 19 | A saúde do catálogo lista serviço, cidade e especialidade sem profissional. |
| 20 | A saúde lista profissional ativa sem serviço ou sem cidade. |
| 21 | A lista de profissionais separa publicada e oculta. A busca da cliente, na mesma hora, só devolve a publicada. |
| 22 | Sem serviço ou sem cidade, o controle de ativar fica desligado e diz o que falta. |
| 23 | Desmarcar ativo tira a profissional da busca. A ficha no painel continua abrindo. Reserva já existente continua na agenda dela. |
| 24 | Marcar ativo, com serviço e cidade, devolve a profissional para a busca. |
| 25 | Bio salva no painel aparece na página pública. Bio vazia não inventa texto. |
| 26 | A foto sai da lista já usada no app. Não há upload neste corte. |
| 27 | O cartão de entrada mostra as datas de perfil e agenda, ou a ausência. |
| 28 | Aceite da versão vigente aparece nesse cartão. Aceite de versão antiga não conta como a vigente. |
| 29 | A ficha de candidatura mostra telefone, endereço, Instagram e as duas notas quando a função devolver a linha. Sem linha, o cartão diz que não há candidatura. |
| 30 | Gênero, se vier na candidatura, não aparece como filtro em catálogo, busca ou lista de profissionais. |
| 31 | Grade e bloqueio salvos pela operação passam a valer na oferta da cliente. |
| 32 | A ordem das agendas aparece só leitura, na sequência de `position`. |
| 33 | A mesa de agendas lista provedor e status reais, sem token e sem linha fictícia dos provedores ainda não ligados. |
| 34 | O controle de status não oferece Homologated. |
| 35 | O campo da Square continua descrito como sandbox. O valor não volta depois de salvar. |
| 36 | Desligar a conexão tira a linha da mesa. A oferta da cliente deixa de usar essa agenda. |
| 37 | Promover cliente cria profissional oculta e não ativa. |
| 38 | A operação troca o papel de outra conta, e a próxima sessão dessa conta cai na home do papel novo. |
| 39 | Na própria linha não há botão para sair de operação. |
| 40 | Com uma única conta `operacao`, rebaixar essa conta é recusado pela função. |
| 41 | A ficha da cliente mostra nome, e-mail e as reservas dela. Não mostra transcrição de chat. |
| 42 | Não há ação de apagar a conta de outra pessoa. |
| 43 | A lista de reservas filtra por saga, provedor, profissional, cidade, serviço e período, e o filtro sobrevive ao abrir o detalhe e voltar. |
| 44 | O cartão da reserva mostra o nome da cliente para a operação. A agenda da profissional, na mesma reserva, não mostra esse nome. |
| 45 | O detalhe da operação não tem Move this session, Cancel reservation nem confirmar presença. |
| 46 | A sessão da cliente, na reserva dela em `provider_confirmed`, continua podendo mover e cancelar. |
| 47 | Check the calendar permanece no detalhe da operação quando a agenda tem leitura. |
| 48 | A fila `compensation_required` abre a lista filtrada e não oferece botão de compensar. |
| 49 | Sem presença confirmada, o botão de repasse fica desligado. |
| 50 | A profissional logada não encontra esse botão na agenda dela. |
| 51 | Financeiro sem linha mostra vazio, sem gráfico. |
| 52 | Com linha, a tabela bate com `finance_report`. Pendente é zero na linha que já tem liberado. |
| 53 | Cliente e profissional em `/admin/financial` e `/admin/settings` caem em `/forbidden`. |
| 54 | Ajustes grava 0%, 20% e 100%. 101% não grava. |
| 55 | Depois de gravar outra comissão, uma linha antiga de `finance_report` permanece com a comissão que tinha. |
| 56 | O cartão de ajustes diz que a taxa nova vale na próxima cobrança que chegar a paga. |
| 57 | Moeda de ajustes aceita três letras maiúsculas e recusa o resto. |
| 58 | Serviço em outra moeda aparece na saúde do catálogo, com as duas moedas. |
| 59 | O interruptor de `confirmed_session` sobrevive ao recarregar. |
| 60 | Não há criar nem apagar regra. A lista de concessões não ganha linha fictícia. |
| 61 | O cartão de recompensa diz que a concessão não paga e não libera repasse. A linha abre a reserva. |
| 62 | Publicar termos cria versão nova e não altera o corpo da anterior. |
| 63 | Rascunho salvo não muda a versão que a profissional vê no onboarding. |
| 64 | A lista de quem falta aceitar a vigente não inclui quem aceitou essa versão. |
| 65 | Aceites em 390px não estouram a página. IP, agente e hash abrem no detalhe. |
| 66 | Nenhuma tela deste corte chama Acuity, Square ou Stripe direto do browser. |
| 67 | Typecheck do app passa. Nenhuma destas telas marca agenda como homologada. |
| 68 | Em 390px, home, ficha, lista de reservas, financeiro e aceites cabem na largura, com cartões empilhados. |
| 69 | A função de candidatura, chamada com cliente ou profissional, é recusada. |
| 70 | A função de candidatura não devolve segredo de agenda, de pagamento nem de webhook. |

## Provas

Ambiente: `https://detox-pass.vercel.app`, conta de operação, mais uma
cliente e uma profissional já existentes. Não criar reserva nova na agenda
de quem já tem horário marcado. Não ativar profissional que a operação
ainda não decidiu publicar. Não colar segredo de produção.

| Prova | Passos | Esperado |
| --- | --- | --- |
| Casca | Abrir `/admin` no desktop e em 390px. | Grupos na lateral; cinco itens na barra; filas com zero real. |
| Papel | Cliente em `/admin/financial` e `/admin/booking`. | `/forbidden`. |
| Defeito atual | Abrir uma reserva `provider_confirmed` no painel e a mesma reserva como a cliente. | O painel não move nem cancela. A cliente ainda move e cancela a dela. |
| Catálogo | Criar, editar, apagar cidade nova e tentar apagar cidade vinculada. | Vínculo bloqueia. Cidade nova some. A saúde aponta catálogo sem profissional. |
| Preço | Mudar o preço de um serviço de profissional ativa. Abrir a ficha pública e uma reserva antiga desse serviço. | A ficha mostra o novo. A reserva antiga mantém o valor que já tinha, ou continua sem valor se nunca teve. |
| Ativo | Tentar ativar ficha sem serviço. Depois ocultar uma profissional de teste e buscar como cliente. | O controle explica a falta. A busca perde e, ao reativar com vínculo, recupera. |
| Grade | Gravar uma janela num dia sem reserva. Abrir a oferta como cliente. | O horário livre aparece. |
| Candidatura | Abrir a ficha de uma profissional que enviou cadastro, e chamar a função com a cliente. | A ficha mostra os campos gravados. A cliente é recusada. |
| Conta | Promover uma cliente de teste. Tentar rebaixar a única operação, se for o caso do ambiente. | A ficha nasce oculta. A função recusa zerar a operação. |
| Cliente | Abrir a ficha de uma cliente com reserva. | Nome, e-mail e a reserva. Sem chat. |
| Reserva | Filtrar por saga e por profissional. Voltar do detalhe. | O filtro permanece. A fila de revisão não tem botão de compensar. |
| Agenda | Abrir a mesa e uma conexão testada. | Status real, sem token, sem provedor inventado. |
| Financeiro | Abrir Financeiro antes de cobrança nova. Mudar a comissão e recarregar. | Vazio ou só linha real. A linha antiga não muda de comissão. 101% não grava. |
| Recompensa | Desligar a regra, recarregar, ligar de novo. | O estado persiste. Sem linha fictícia. |
| Termos | Salvar rascunho, publicar, abrir no celular a lista de aceites e a de quem falta. | Versão antiga intacta. Quem já aceitou a vigente não está na falta. |
| Segredo | Salvar o campo sandbox, recarregar, inspecionar a mesa. | O campo volta vazio. A mesa não contém o valor. |
| Largura | Repetir home, ficha, reservas, financeiro e aceites em 390px. | Cartões empilhados, sem texto por cima de texto. |

Repasse liberado e cobrança nova ficam bloqueados até existir pagamento
confirmado de verdade. Não se cria cobrança de ensaio para pintar a tabela.

## Fora deste corte

- Estorno, no-show, prazo para cancelar e dinheiro já capturado quando a
  agenda recusa. A fila de revisão mostra o caso e não o resolve.
- Repasse automático além do botão, que só chama `authorize_payout`.
- A operação reordenar a agenda de outra pessoa.
- Upload de foto fora da lista atual.
- Ler ou apagar a conversa do agente de outra conta.
- Favoritos da cliente, porque não há tabela.
- Bloqueio de cliente, porque não há coluna. Ocultar vale para a
  profissional, por `active`.
- Reviews, Docs, suporte interno, selo, destaque e número que não seja
  contagem das tabelas acima.
- Homologar qualquer agenda.
- Tratar os parâmetros acima como já aceitos antes da prova na interface
  publicada. O mover e o cancelar saíram do detalhe da operação neste
  corte; a prova ainda é a sessão publicada.
