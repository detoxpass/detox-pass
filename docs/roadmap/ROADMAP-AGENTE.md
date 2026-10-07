# Agente de IA

Data: 2026-10-06. Decisão em [`DECISIONS.md`](../DECISIONS.md), seção
"O agente reserva pelo comando que a tela já usa". A norma curta continua em
[`spec/10-chat-agente.md`](../../spec/10-chat-agente.md).

A prova desta fase, quando a implementação existir, é a sequência da decisão
"A prova desta fase é o app publicado": commit e push em `detoxpass/main`,
`supabase db push --linked`, `supabase functions deploy chat`, segredo
`OPENAI_API_KEY` só no projeto `detoxpass`, e o fluxo em
`https://detox-pass.vercel.app`. Este arquivo é o plano. A função `chat`
publicada hoje só lista o catálogo e não é o aceite.

A tela é da cliente. Profissional e operação não ganham um agente que reserva
por elas. Se uma dessas contas abrir `/chat`, a ferramenta de conta devolve a
própria ficha e a de agendar responde que só a cliente reserva.

## O que uma volta faz

Uma volta é um POST na Edge Function `chat`, com o JWT de quem fala. A função
não usa `service_role` para ler o catálogo. A reserva, quando acontece, entra
pela ação `book` de `scheduling-internal`, que já confere o papel e a grade.

A resposta da função é JSON. A tela desenha blocos. O modelo não devolve HTML.

```
texto da cliente, ou áudio já transcrito
  → no máximo 4 ferramentas
  → blocos visuais + o texto que apresenta esses blocos
```

Orçamento de uma volta, para caber na função e na espera da pessoa:

| Teto | Valor |
| ---- | ----- |
| Tempo da volta | 20 segundos. Acima disso a função devolve o que já tem e o bloco `limit`. |
| Ferramentas | 4. A quinta não roda. |
| Profissionais numa busca | 8. |
| Horários num dia | 12. |
| Dias pedidos de uma vez | 1. |
| Mensagens anteriores enviadas ao modelo | 8, desta conversa, desta pessoa. |
| Bytes de uma ferramenta de volta ao modelo | 12 KB. O resto é cortado e o bloco diz que a lista foi cortada. |
| Áudio | 60 segundos e 2 MB. Acima disso a função recusa antes de chamar a OpenAI. |
| Corpo do POST | 2 MB. |

A função não espera o teto de parede da plataforma. Uma volta que passa de
20 segundos já falhou o aceite, mesmo que a plataforma ainda aceite o
processo.

## Fronteira do modelo

A tela não importa SDK de modelo. Ela fala com `/functions/v1/chat`.

Dentro da função, um módulo `complete(messages, tools)` chama a OpenAI. O
nome do modelo de conversa é `OPENAI_CHAT_MODEL`. O nome do modelo de
transcrição é `OPENAI_TRANSCRIBE_MODEL`. Os dois segredos e a chave
`OPENAI_API_KEY` ficam nos secrets da função. Nenhum entra no Git, no bundle
ou na resposta.

Sem `OPENAI_API_KEY`, a busca, a ficha, a conta, a grade e o agendamento
continuam testáveis por um runner sem modelo. O microfone responde que a
transcrição não está configurada. A caixa de texto continua. A tela não
inventa uma frase de modelo.

Trocar o nome do modelo não muda ferramenta, bloco, RLS nem o comando de
reserva.

## Ferramentas

Cinco ferramentas. O modelo escolhe o nome e os argumentos. O servidor
valida o JSON, corta o tamanho e executa. Argumento fora do esquema é erro
da ferramenta, não uma busca inventada.

| Ferramenta | Lê ou escreve | O que faz |
| ---------- | ------------- | --------- |
| `search_professionals` | Lê | Acha profissionais ativas por texto e por ids. |
| `get_professional` | Lê | Uma ficha pública: nome, foto, serviços com preço, cidades, especialidades, modo da agenda. |
| `get_my_account` | Lê | Quem fala: nome, papel, e-mail, e as próprias reservas futuras. |
| `get_openings` | Lê | Horários de um dia, de uma profissional, no modo de agenda dela. |
| `book_opening` | Escreve | Reserva o horário que a cliente tocou. |

Não há ferramenta de cancelar, reagendar, cobrar, confirmar visita, liberar
repasse, mudar papel, aprovar ficha nem ler outra pessoa.

### Busca

Uma função SQL `search_professionals`, `security invoker`, para a RLS de
profissional ativa valer mesmo se o filtro do aplicativo esquecer `active`.
O texto usa `pg_trgm` em `display_name`, `services.name`, `cities.name` e
`specialties.name`. Ids explícitos não dependem do trigram.

Entrada:

| Campo | Regra |
| ----- | ----- |
| `query` | Texto livre, no máximo 80 caracteres. Vazio é permitido quando há id. |
| `service_ids` | No máximo 3. Id que não existe é ignorado e volta em `unknown_ids`. |
| `city_ids` | No máximo 3. |
| `specialty_ids` | No máximo 3. |
| `limit` | O servidor força 8. O modelo não aumenta. |

Saída, por profissional, nesta ordem: id, nome, foto, cidades, serviços com
`price_cents` e `currency`, especialidades, `schedule_mode`. Sem telefone,
endereço, data de nascimento, bio da ficha privada nem `profile_id`.

Ordem quando a busca não foi alargada:

1. Nome igual ao texto, sem distinguir maiúsculas.
2. Nome que contém o texto.
3. Serviço e cidade pedidos juntos.
4. Serviço pedido.
5. Cidade pedida.
6. Especialidade.
7. Nome de exibição, para desempate.

### Busca alargada

Se o recorte inteiro volta vazio, o servidor alarga sozinho, numa ordem fixa,
e diz o que tirou. O modelo não inventa a segunda busca.

| Passo | O que sai | O que fica |
| ----- | --------- | ---------- |
| 0 | Nada | Texto, serviços, cidades e especialidades. |
| 1 | Especialidades | Texto, serviços e cidades. |
| 2 | Cidades | Texto e serviços. |
| 3 | Texto solto que não bateu com nome | Serviços. |

Para no primeiro passo com resultado. Não tira o serviço para “achar alguém”.
Não troca a cidade por outra cidade parecida. Não cria sinônimo clínico:
“dor nas costas” não vira um serviço que o catálogo não tem. Se o texto for
igual ao nome ou ao slug de um serviço, cidade ou especialidade, esse id entra
no recorte antes da busca.

A resposta traz `relaxed: []` ou a lista do que saiu (`specialties`, `cities`,
`query`). A tela mostra essa lista em linguagem clara. Exemplo: “Ninguém com
essa especialidade. Estas profissionais fazem o serviço na cidade pedida.”

Zero depois do passo 3 é uma resposta válida. O bloco é `empty`. O modelo não
completa com profissional de fora da plataforma.

### Ficha

`get_professional` recebe um id. Id desconhecido, inativo ou de outra forma
invisível pela RLS volta `not_found`. A ficha não inclui as reservas de
outras clientes.

### Conta de quem fala

`get_my_account` ignora qualquer id que o modelo mande. O filtro é
`auth.uid()`.

Devolve `full_name`, papel e e-mail da sessão, e no máximo 8 reservas em que
`client_id` é essa pessoa, com serviço, cidade, profissional, `starts_at` e
`saga_status`. Não devolve reserva de outra cliente. Não devolve telefone,
endereço nem a ficha privada de parceiro.

### Agenda

`get_openings` exige `professional_id` e `date` (`YYYY-MM-DD`).

| `schedule_mode` | O que a ferramenta faz |
| --------------- | ---------------------- |
| `internal` | Chama a mesma leitura de `internal_openings` que a tela usa. Devolve no máximo 12 instantes. |
| `external` | Chama o adapter daquela ficha. Sem credencial, devolve `pending` e zero horários. Não usa a grade interna no lugar. |
| vazio | Devolve `unavailable`. Zero horários. |

Cada horário volta com `starts_at` e um `opening_token`. O token é HMAC do
segredo da função sobre `user_id`, `professional_id`, `service_id`,
`city_id`, `starts_at` e expiração de 10 minutos. O modelo pode mostrar o
horário. O modelo não fabrica o token: a função só emite token para um
instante que a grade devolveu.

`service_id` e `city_id` precisam pertencer àquela profissional. Se faltarem
e ela tiver um só serviço e uma só cidade, a função preenche esses ids e o
bloco diz quais são. Se houver mais de um, a função não escolhe: devolve o
bloco `choice` com os serviços ou as cidades reais.

### Agendar

`book_opening` exige o `opening_token` do toque. Não aceita um `starts_at`
solto.

A função confere o HMAC, a expiração, o `user_id` e se o papel é `cliente`.
Aí chama `scheduling-internal` `book` com o JWT dela. O preço não vai no
corpo. A saga segue a que o comando já grava: intenção e, se a grade ainda
tiver o instante, `provider_confirmed`, `provider = internal`,
`amount_cents` nulo.

Texto do tipo “reserva às 15h” não chama `book_opening`. A volta pede a grade
e a cliente toca o horário.

Segundo toque no mesmo token, ou outro token do mesmo instante já ocupado,
não cria outra reserva ativa. A resposta é o mesmo erro de horário em
andamento que a tela já mostra.

Profissional e operação recebem recusa. A função não reserva em nome de outra
pessoa.

Agenda `external` ou sem modo não entra neste `book`. O bloco explica que
aquele horário não está na agenda interna. Não há reserva “por conversa” num
adapter pendente.

## Áudio

A única mídia é um áudio gravado no navegador. Não há imagem, vídeo nem
arquivo solto.

1. A cliente grava. O navegador para aos 60 segundos.
2. O POST `action: transcribe` manda o áudio. A função recusa acima de 2 MB
   ou um tipo que não seja `audio/webm` ou `audio/mp4`.
3. A OpenAI devolve texto. A função não guarda o áudio.
4. O texto entra no campo de escrita. A cliente pode corrigir e enviar.
5. A bolha da conversa mostra o texto, com a marca de que veio de áudio. Não
   mostra um player.

Sem chave, o microfone não finge uma transcrição. O campo de texto segue
utilizável.

## Blocos visuais

A resposta é `{ blocks: [...] }`. A tela tem um componente por `type`. Tipo
desconhecido vira o bloco `error` com o texto fixo “This reply could not be
shown.” A tela não usa `innerHTML` e não executa markdown com HTML.

| `type` | O que a pessoa vê |
| ------ | ----------------- |
| `text` | Bolha do agente. Texto puro, no máximo 500 caracteres por bolha. |
| `user` | Bolha da cliente. Se `from_audio` for verdadeiro, um ícone de microfone junto do texto. |
| `professional_cards` | Até 8 cartões no padrão da busca: foto, nome, preço do serviço, cidade. Toque abre a ficha no chat. Coração não entra aqui. |
| `professional_detail` | Uma ficha: foto, nome, serviços, cidades, especialidades, modo da agenda. Ação “See times” chama `get_openings`. Ação “Open profile” vai a `/therapists/:id`. |
| `choice` | Botões com os serviços ou as cidades que a ficha realmente tem. |
| `openings` | Até 12 horários do dia pedido. Cada botão manda o `opening_token` de volta. Horário vazio diz que aquele dia não tem grade. |
| `booking_receipt` | Serviço, cidade, profissional, horário e o status real da saga. Sem valor inventado. Ação abre `/sessions/:id`. |
| `account` | Nome de quem fala e a lista das próprias reservas. |
| `empty` | Não há profissional naquele recorte. Se `relaxed` tiver itens, a frase diz o que foi tirado. |
| `pending` | Agenda externa sem credencial, ou transcrição sem chave. |
| `error` | Falha de ferramenta ou bloco ilegível. |
| `limit` | A volta estourou tempo, ferramentas ou tamanho. Pede para tentar de novo, com o que já foi desenhado acima. |

A conversa usa o rosa, o raio e a página que o app já tem. Em 390px os
cartões e os horários ficam uma coluna. Em 800px ou mais, os cartões seguem
a grade da busca. O campo de texto e o microfone ficam fixos no fim da coluna
de conversa, acima da barra mobile.

Inglês na interface. Os nomes de serviço, cidade e profissional são os do
catálogo.

## Conversa guardada

`public.chat_threads` e `public.chat_messages`, com RLS: a pessoa só lê e
insere na própria thread. A mensagem guarda `role`, `body`, `blocks` e
`created_at`. Não guarda áudio, não guarda o token de horário além dos 10
minutos da ferramenta, e não guarda resposta bruta da OpenAI.

A operação não ganha leitura destas tabelas nesta fase. Retenção longa
continua em aberto. O produto não apaga a conta inteira por causa do chat
neste corte.

## O que o modelo não pode fazer a volta passar

Estas frases, mesmo que o modelo as escreva, não mudam o banco:

- Um horário que `get_openings` não devolveu.
- Um id de profissional que a busca não devolveu.
- Preço, comissão, pontos ou avaliação.
- Conduta clínica, diagnóstico ou conselho de saúde. A função troca essa
  volta por um `text` fixo: a Detox Pass marca massagem, não orienta
  tratamento. A troca acontece por uma lista curta de pedidos clínicos no
  servidor, antes do modelo, e o teste não depende do modelo “se comportar”.
- Dados de outra cliente.
- Cobrança, payout, cancelamento e reagendamento.

## Fora desta fase

- Imagem, vídeo e anexo.
- Memória de longo prazo entre conversas.
- Agente da profissional ou da operação.
- Reserva em agenda externa.
- Stripe dentro do chat.
- Cancelar ou reagendar pelo chat.
- Marcar a OpenAI ou qualquer agenda externa como homologada.
- Streaming. A volta devolve o JSON inteiro.

## Ordem de implementação

1. A função SQL de busca, o trigram e os testes dela, sem modelo.
2. O runner das cinco ferramentas, com token de horário, ainda sem modelo.
3. `complete()` atrás da variável do modelo, com o teto de 4 voltas de ferramenta.
4. Tabelas da conversa e a tela de blocos.
5. Transcrição, com o texto caindo no campo antes do envio.
6. Prova no app publicado, com a chave só no secret do projeto `detoxpass`.

O passo 1 já pode ser aceito sem chave. O passo 6 não.

## Aceite

| # | Parâmetro | Prova |
| - | --------- | ----- |
| 1 | Busca por nome devolve só profissional ativa cujo nome bate, no máximo 8. | SQL no projeto `detoxpass`, com uma ativa e uma inativa de nome parecido. |
| 2 | Busca por id de serviço e id de cidade devolve só quem oferece os dois. | SQL, um par que existe e um par que não existe. |
| 3 | Texto igual ao nome de um serviço vira filtro desse serviço antes do trigram. | SQL com o nome exato de um serviço semeado. |
| 4 | Recorte vazio tira a especialidade primeiro, depois a cidade, e nunca o serviço. A resposta lista `relaxed`. | Três chamadas controladas: uma que acha ao tirar a especialidade, uma ao tirar a cidade, uma que continua vazia. |
| 5 | “Dor nas costas” não cria serviço nem devolve profissional fora do catálogo. | Busca com esse texto e sem serviço correspondente. O bloco é `empty`. |
| 6 | Id desconhecido volta em `unknown_ids` e não alarga a busca para o catálogo inteiro. | SQL com um uuid que não está em `services`. |
| 7 | `get_professional` de ficha inativa é `not_found` para a cliente. | JWT de cliente no app publicado. |
| 8 | A ficha não traz telefone, endereço, nascimento nem `profile_id`. | Resposta da ferramenta, campos ausentes. |
| 9 | `get_my_account` ignora um id mandado pelo modelo e devolve só `auth.uid()`. | Duas clientes. A resposta da primeira não contém reserva da segunda. |
| 10 | `get_openings` num dia coberto pela grade interna devolve só instantes dessa grade, no máximo 12, cada um com token. | Profissional interna com janela conhecida. Um dia coberto e um dia sem janela. |
| 11 | Modo vazio devolve `unavailable` e zero horários. | Ficha sem `schedule_mode`. |
| 12 | Modo externo sem credencial devolve `pending` e zero horários. Não cai na grade interna. | Ficha externa sem conexão. |
| 13 | Token alterado, expirado ou de outra pessoa não reserva. | Três chamadas de `book_opening`, nenhuma cria `bookings`. |
| 14 | Toque num horário devolvido cria uma reserva interna `provider_confirmed`, com `amount_cents` nulo, pelo mesmo comando da tela. | App publicado, cliente, um horário livre. |
| 15 | O mesmo instante, num segundo toque, não cria outra reserva ativa. | Duas chamadas. A segunda volta o erro de horário em andamento. |
| 16 | Profissional autenticada não reserva pelo chat. | JWT de profissional. Zero linhas novas em `bookings`. |
| 17 | Texto “reserva às 15h”, sem token, não cria reserva. A volta pede a grade ou mostra horários. | Runner sem deixar o modelo chamar `book_opening` direto. |
| 18 | Serviço ou cidade que a profissional não oferece não gera token. | `get_openings` com ids de outro catálogo. |
| 19 | Mais de um serviço e mais de uma cidade, sem escolha, devolve `choice` e não reserva. | Ficha com dois serviços. |
| 20 | Pedido clínico recebe o texto fixo e não chama o modelo. | POST com um pedido de diagnóstico. O log da função não mostra chamada de modelo. |
| 21 | Tipo de bloco desconhecido vira `error` e não vira HTML. | Fixture na tela com `type: "script"`. O DOM não contém a string executável. |
| 22 | Cartão, ficha, horários, recibo, conta, vazio, pendente e limite têm teste de render. | Um fixture por tipo, no app publicado ou no build da tela. |
| 23 | Em 390px a conversa é uma coluna e o campo fica acima da barra. Em 800px os cartões acompanham a grade da busca. | `https://detox-pass.vercel.app/chat` nos dois larguras. |
| 24 | Áudio de 61 segundos ou de 2 MB + 1 byte não chama a OpenAI. | Duas requisições recusadas, sem transcrição. |
| 25 | Áudio válido volta texto para o campo. A cliente edita antes de enviar. A bolha marca `from_audio`. O áudio não fica no banco. | App publicado, uma gravação curta, e `chat_messages` sem coluna de arquivo. |
| 26 | Sem `OPENAI_API_KEY`, o microfone mostra `pending` e a busca por runner ainda responde. | Função sem o secret, num teste que não usa produção como laboratório de chave. A produção só entra no passo 6, com o secret gravado. |
| 27 | Uma volta com 5 ferramentas pedidas executa 4 e devolve `limit`. | Runner com um modelo de teste que pede a quinta. |
| 28 | Uma ferramenta que passaria de 12 KB volta cortada, com a marca de corte. | Fixture de busca grande. |
| 29 | A cliente A não lê thread da cliente B. | Duas sessões. Select da thread alheia volta vazio. |
| 30 | A operação não lê `chat_messages` nesta fase. | JWT de operação, quando existir. Enquanto não existir, a policy não tem papel `operacao` na leitura. |
| 31 | Preço no argumento da ferramenta é ignorado. O recibo não mostra dólar inventado. | `book_opening` com um campo extra de valor. A reserva fica com `amount_cents` nulo. |
| 32 | O cartão do chat abre `/therapists/:id` da mesma profissional, e o recibo abre `/sessions/:id` da reserva criada. | App publicado, os dois toques. |
| 33 | Reserva criada pelo chat aparece na caixa de avisos da cliente e da profissional, pelos tipos que a caixa já tem. | A mesma reserva do item 14, nas duas caixas. |
| 34 | Cancelar e reagendar não existem como ferramenta. O modelo pedir isso devolve texto apontando para `/sessions/:id`. | Runner. Nenhuma chamada a `mark_cancelled` ou `mark_rescheduled`. |

## Testes que não dependem do modelo

Estes rodam no CI, sem OpenAI e sem navegador.

| # | Caso |
| - | ---- |
| T1 | Nome exato fica na frente de nome parcial. |
| T2 | Inativa some mesmo se o texto bater. |
| T3 | Serviço e cidade juntos excluem quem só tem um dos dois. |
| T4 | Alargamento na ordem especialidade, cidade, texto. |
| T5 | O serviço pedido sobrevive ao alargamento. |
| T6 | Texto clínico sem serviço igual no catálogo devolve vazio e `relaxed` coerente. |
| T7 | `limit` acima de 8 volta 8. |
| T8 | `unknown_ids` não zera os filtros válidos. |
| T9 | Token válido passa. Token com um byte trocado falha. |
| T10 | Token de outra `user_id` falha. |
| T11 | Token expirado falha. |
| T12 | Token de um `starts_at` diferente do corpo falha. |
| T13 | Papel profissional é recusado antes do RPC de reserva. |
| T14 | Lista clínica casa “diagnosis”, “treatment plan” e o equivalente pedido no teste, e não casa “deep tissue”. |
| T15 | Bloco `script` no renderer de teste vira `error`. |
| T16 | Áudio acima de 2 MB é recusado pelo validador, sem fetch. |
| T17 | Tipo `audio/wav` é recusado. |
| T18 | Quinta ferramenta não é despachada. |
| T19 | Resposta de ferramenta acima de 12 KB é cortada e marcada. |
| T20 | Argumento que não está no esquema da ferramenta volta erro e não chega ao SQL. |

O job de CI destes testes é `deno test` no runner das ferramentas e da busca,
no mesmo workflow que já testa o horário. Não sobe Postgres local como prova.
A prova dos itens 1 a 16 do aceite que falam do banco é `supabase db query`
no projeto `detoxpass` depois do `db push`. A prova dos itens de tela é o
app publicado.

## O que ainda não está feito

O corte publicado e o que ficou de fora estão em
[`ROADMAP-AGENTE-ACEITE.md`](../aceite/ROADMAP-AGENTE-ACEITE.md). O microfone ao vivo
não transcreveu. Não há profissional com agenda externa neste banco, então
esse caminho não foi exercido numa ficha real. Operação continua sem conta.
