# Agenda, integrações e onboarding

Data: 2026-10-06. Plano de tela e de entrada da profissional. A construção
deste corte entrou no código em 2026-10-06. As decisões abaixo fecham o
que estava aberto neste texto. A copy da interface continua em inglês. Este texto é o plano.

A regra de 2026-10-05 (uma agenda só, interna ou externa) deixa de valer
quando esta tela for construída. No lugar entra a união com prioridade,
descrita em «Várias agendas, uma cliente».

## Decisões fechadas

1. A cliente vê a união dos horários livres. Se o mesmo horário está livre em
   mais de uma agenda, a reserva cai na de maior prioridade. A primeira da
   lista é a prioridade 1.
2. Toda profissional passa pelo onboarding, inclusive conta que já existe e
   inclusive quem já tem reserva.
3. O calendário da profissional mostra só a reserva que nasceu aqui, com a
   cor da agenda que a recebeu.
4. Quando o pagamento entrar, ele vira um passo obrigatório antes dos termos.
   Quem já concluiu perfil, agenda e a versão vigente dos termos vê só o
   pagamento. A plataforma continua fechada até esse passo fechar.
5. A entrada não usa um status `onboarding` na conta. A trava é derivada dos
   passos com data. O último passo desta leva é o aceite da versão vigente
   dos termos. A operação edita esse texto no super admin, com versão
   imutável e data de publicação.

## Duas páginas

A profissional deixa de configurar a agenda dentro do calendário.

| Página | O que é |
| --- | --- |
| Agenda | Um calendário só. Mostra as reservas de todas as agendas ligadas, cada uma com a cor do provedor. Visão do mês e da semana. No celular as marcações do dia continuam legíveis. Uma barra ao lado lista Reservations. Um botão leva às configurações em Integrações. |
| Integrações | Cards com o nome e a marca de cada agenda. O card abre um modal em passos e configura só aquela agenda. Outro botão abre o modal de prioridade. |

A Agenda não repete grade semanal, bloqueio nem formulário de token. Isso mora
no modal da agenda correspondente. A interna configura fuso, duração, janelas
e bloqueios. A Square configura o login, a unidade, a pessoa e o serviço. As
outras quatro aparecem no card e o modal diz que esta tela ainda não conecta.

A cliente não vê essas páginas. Ela reserva um horário na ficha da
profissional e não escolhe Square, Acuity nem Detox Pass. Quem muda ou
cancela a reserva da cliente continua sendo a cliente. A profissional vê a
reserva e não a altera.

## O que o calendário pinta

Cada reserva que nasceu na plataforma leva a cor da agenda que a recebeu.
Detox Pass, Square, Acuity, Wix, Zenoti e Mindbody têm cor fixa. A
profissional não escolhe a cor. A marca do card usa nome e sinal gráfico até
existir arquivo de logo aprovado.

A visão do mês marca os dias que têm reserva. A visão da semana mostra o
horário. A barra de Reservations é a lista que já existe na Agenda, ao lado
do calendário no desktop e abaixo dele no celular.

Horário que existe só na agenda de fora, sem reserva daqui, não aparece neste
calendário e não vira linha local.

## Várias agendas, uma cliente

A profissional pode ligar mais de uma agenda. Cada uma guarda o próprio token
no Vault e a própria configuração. Login de uma não serve para outra.

A cliente vê um consolidado:

1. Cada agenda ligada devolve os horários livres dela.
2. A cliente vê a união, sem nome de provedor.
3. Se o mesmo horário está livre em duas ou mais, a reserva é gravada na de
   menor número de prioridade. A primeira da lista é a 1.

A prioridade é uma ordem única, que inclui a agenda interna quando ela está
ligada. Com uma agenda só, ela fica na posição 1. Agenda nova entra no fim da
lista. A profissional reordena em Integrações: um botão abre um modal com
arrastar e soltar, e com setas, para quem prefere teclado. A ordem salva é a
prioridade.

`is_source` deixa de decidir sozinha onde a reserva cai. A ordem da lista
passa a ser essa regra. A interna continua com a própria configuração. Ela
não reescreve uma reserva que a prioridade já mandou para outra agenda.

Se a agenda de maior prioridade não responder, os horários dela ficam de fora
da união naquela consulta. Horário livre numa agenda que respondeu continua
aparecendo e cai nessa agenda, segundo a ordem. Preço, pagamento, estorno e
repasse não mudam. O preço do serviço continua com a operação.

## Entrada da profissional

Depois do login, a profissional com algum passo obrigatório em aberto não vê
o restante da plataforma. O login existe. O menu não. O modal atual de escolha
de agenda vira o passo de agenda. Somem «não mostrar de novo» e «continuar
sem escolher».

O papel da conta continua `profissional`. A coluna `professionals.active`
continua a significar ficha aprovada pela operação. Nenhuma das duas vira
`onboarding`. Um status único na conta apaga o que já foi feito quando surge
um passo novo ou uma versão nova dos termos, e não guarda qual texto a
pessoa aceitou nem quando.

A trava lê os passos. Cada passo obrigatório tem `completed_at`. A
profissional entra na plataforma quando todos os passos vigentes estão
preenchidos. Cliente e operação não têm esses passos.

Passos desta leva, nesta ordem:

1. Perfil. Foto, nome de exibição, bio, serviços e cidades. Os serviços e as
   cidades são os que a operação já cadastrou. A profissional liga os dela.
   O preço não entra neste passo. Dado que já existe aparece preenchido. O
   passo fecha quando foto, nome, bio, ao menos um serviço e ao menos uma
   cidade estão salvos.
2. Agenda. A interna, com a grade publicada, ou um parceiro, no fluxo
   completo daquele card. Uma agenda pronta fecha a etapa. As outras podem
   ser ligadas depois, em Integrações.
3. Termos. A profissional lê a versão publicada até o fim, marca o aceite e
   confirma. O servidor grava o registro descrito em «Registro do aceite».
   Aceite de versão antiga não fecha este passo.

Pagamento, quando a integração existir, entra antes dos termos. Os termos
permanecem o último passo. Quem já aceitou a versão vigente e só não tem
pagamento vê só o pagamento. Quem está numa versão antiga vê o pagamento e,
em seguida, o aceite da versão nova.

Concluir os passos não publica a ficha. A profissional segue inativa até a
operação aprovar, como na decisão de 2026-10-05.

Conta antiga entra no mesmo processo. Sarah Anderson e Detox Pass entram.
Reserva já marcada continua marcada. A de 12 de outubro da Sarah permanece.
Ela conclui perfil, confirma a agenda interna que já tem e aceita a versão
vigente dos termos antes de ver o menu. A ficha Detox Pass continua inativa.

O checkbox do formulário público de parceiro grava hoje só
`partner_applications.terms_accepted_at`, sem documento. Esse carimbo não
fecha o passo. O formulário passa a mostrar a versão publicada e a gravar o
aceite dessa versão. Se a operação ainda não publicou versão nenhuma, o
cadastro de parceiro não oferece aceite.

## Termos no super admin

A operação tem uma tela em `/admin/terms`. Só `operacao` escreve.

Cada publicação cria uma versão nova e imutável:

| Campo | Uso |
| --- | --- |
| Número da versão | Cresce a cada publicação. A vigente é a de maior número publicada. |
| Título e texto | O que a profissional lê no último passo. |
| `published_at` | Data e hora da publicação. |
| `published_by` | Quem publicou. |
| Rascunho | Pode ser editado. Publicar congela o texto. Correção é outra versão. |

A lista mostra número, situação, data de publicação e quantos aceites aquela
versão recebeu. O texto publicado não é reescrito. Na publicação o servidor
calcula `content_sha256`, SHA-256 do título e do corpo em UTF-8. Esse hash
acompanha a versão e não muda.

## Registro do aceite

Cada aceite é uma linha imutável. Há no máximo uma por usuária e versão. Um
segundo clique na mesma versão não cria outra linha. Versão nova pede outra
linha. O relógio é o do servidor. O browser não informa a data.

O botão só habilita depois que o texto foi rolado até o fim e a caixa foi
marcada. O servidor recusa a gravação sem esses dois sinais, e também recusa
se o hash que a tela mostra for diferente do hash da versão publicada.

| Campo | O que guarda |
| --- | --- |
| `terms_version_id` | Versão aceita. |
| `version_number` | Número da versão, copiado na hora. |
| `content_sha256` | Hash do texto publicado. Igual ao hash calculado na publicação. |
| `accepted_at` | Data e hora do servidor, com fuso. |
| `user_id` | Conta autenticada. |
| `professional_id` | Ficha da profissional. |
| `email` | E-mail da conta naquele instante. |
| `display_name` | Nome de exibição naquele instante. |
| `surface` | `partner_signup`, `onboarding` ou `reacceptance`. |
| `ip` | Endereço da requisição. |
| `user_agent` | Cabeçalho da requisição. |
| `locale` | Idioma da tela apresentada. Nesta leva, `en`. |
| `scrolled_to_end` | Só entra `true`, depois do fim do texto. |
| `checkbox_confirmed` | Só entra `true`, com a caixa marcada. |

A tela `/admin/terms` lista esses campos por aceite. Não entra localização
precisa, impressão digital do aparelho nem cópia repetida do texto: a versão
publicada já é imutável e o hash aponta para ela.

O carimbo antigo `partner_applications.terms_accepted_at` continua no banco
como histórico do formulário e não satisfaz este registro.

## Ordem de construção

1. Versões dos termos, o registro completo do aceite e a tela `/admin/terms`.
2. Passos com `completed_at` e a trava depois do login. A conta não ganha
   status `onboarding`.
3. Passo de perfil, com o que já existe preenchido.
4. Página de Integrações: cards, modal em passos por agenda, modal de
   prioridade. A prioridade substitui `is_source` como regra da reserva.
5. Passo de agenda dentro da trava, e o passo final de aceite da versão
   vigente.
6. Página de Agenda: calendário mensal e semanal, cor por agenda, Reservations
   e o botão para Integrações.
7. Reserva da cliente pela união e pela prioridade.

## Fora deste corte

- Ligar Acuity, Wix, Zenoti ou Mindbody.
- Importar horário que nasceu só na agenda de fora e transformar em reserva.
- Mostrar horário externo sem reserva daqui, nem como leitura.
- Reservar agenda externa pelo chat.
- Marcar qualquer agenda como homologada.
- Cobrar ou configurar pagamento.
- A profissional cancelar ou reagendar a reserva da cliente.
