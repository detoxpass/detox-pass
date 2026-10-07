# Prompt para levar um módulo até a produção

Este é o roteiro que o Detox Pass usou na agenda interna, nas notificações, no
agente, no painel da operação, na Square e na Wix. Serve para um módulo
inteiro, uma função ou um ajuste grande. Cada entrega deixa três coisas: um
roadmap com os parâmetros de aceite, o código publicado e um relatório do que
a produção respondeu.

## Como usar

1. Copie o bloco abaixo inteiro para o agente.
2. Preencha os campos entre `{{ }}`. Campo sem resposta fica `nenhum`, nunca
   em branco.
3. Escolha o modo:
   - `planejar` para no roadmap e devolve para revisão;
   - `implementar` parte de um roadmap já aprovado;
   - `completo` vai do roadmap até o relatório de aceite.
4. Revise o roadmap antes de liberar a implementação, quando o risco for
   médio ou alto (ver [`DEVELOPMENT_WORKFLOW.md`](../DEVELOPMENT_WORKFLOW.md)).

Os modelos dos dois documentos estão ao lado:
[`ROADMAP-MODELO.md`](./ROADMAP-MODELO.md) e
[`ACEITE-MODELO.md`](./ACEITE-MODELO.md).

## O prompt

````text
Você vai levar {{MODULO}} do Detox Pass da leitura até a prova em produção.
Responda em português. A cópia da interface é em inglês.

## Pedido

- Módulo ou função: {{MODULO}}
- Nome curto do arquivo: {{SLUG}}  (ex.: NOTIFICACOES, WIX, PAGAMENTOS)
- O que precisa existir no fim: {{RESULTADO_ESPERADO}}
- Modo: {{planejar | implementar | completo}}
- Decisão que autoriza: {{seção de docs/DECISIONS.md, ou "nenhuma ainda"}}
- Contas e dados de prova liberados: {{e-mails, fichas, sites, sandbox}}
- O que não pode ser tocado: {{reservas reais, contas, projetos, nada}}
- Credenciais já gravadas: {{nome do secret ou da conexão, nunca o valor}}

## Fontes, nesta ordem

1. docs/DECISIONS.md. A decisão aprovada mais recente vence.
2. docs/PRODUCT_SCOPE.md, o resumo da proposta comercial.
3. O playbook em docs/playbook/.
4. A identidade visual nova.
5. Figma e Bubble, só como histórico de UX. Não justificam escopo.

Leia também docs/roadmap/ROADMAP.md, o roadmap do módulo vizinho, a spec do
módulo, supabase/migrations, supabase/functions e apps/web/src. Se duas fontes
discordarem, a de cima vence, e o conflito entra no roadmap como decisão
aberta. Não feche sozinho uma decisão de produto.

## Regras que não mudam

- Prova é produção: https://detox-pass.vercel.app, projeto Supabase detoxpass
  (otddminugslmacdirual) e o commit que está em detoxpass/main. Docker,
  supabase start e 127.0.0.1 não contam como aceite. tsc e teste unitário são
  checagem, não aceite.
- Três perfis: cliente, profissional e operacao. O papel mora em
  app_metadata, nunca em user_metadata.
- Preço vem da operação, em services.price_cents com services.currency. A
  cliente não envia valor.
- Pagamento, estorno, repasse e cobrança de teste continuam desligados até a
  decisão que os libera. Não crie cobrança para testar.
- Não invente dado nem capacidade: avaliação, nota, KPI que não sai de linha
  real, bio, preço, horário desenhado, endpoint de terceiro que não respondeu.
- Documentação de terceiro é hipótese até a chamada real responder. Registre
  o que respondeu diferente.
- Segredo nunca entra no Git, na resposta, no log nem na URL. Vai para o
  Vault (private.store_calendar_secret) ou para os secrets do projeto. Cite
  só o nome.
- Não use outro projeto Supabase, outro repositório nem outra conta.
- Status de integração: pending até a função publicada fechar o ciclo;
  tested é esse ciclo; homologated é decisão humana e não sai deste trabalho.
- Não altere git config. Não faça force-push nem amend.

## Etapa 1 — Ler e relatar o que existe

Antes de escrever código, descubra o que o banco, as funções e a tela já
fazem para este módulo. Consulte o projeto detoxpass quando o estado importar:
contagem de linhas, status, quem tem permissão. Escreva o que achou na seção
"Relatório do que existe hoje" do roadmap. Diga o que foi lido no banco e o
que foi lido só no código.

## Etapa 2 — Escrever o roadmap

Crie docs/roadmap/ROADMAP-{{SLUG}}.md seguindo
docs/templates/ROADMAP-MODELO.md. Acrescente uma linha em
docs/roadmap/ROADMAP.md apontando para ele.

Cada parâmetro de aceite precisa de:
- um número;
- o que se testa, numa frase;
- o resultado esperado, observável (HTTP, linha do banco, texto da tela);
- onde a prova acontece (URL publicada, projeto detoxpass, conta usada).

Inclua, quando se aplicar:
- o caminho feliz de cada papel que usa o módulo;
- a recusa de cada papel que não pode (403, tela "You can't open this");
- repetir a mesma chamada sem gravar outro efeito;
- assinatura ausente e assinatura inválida em webhook (401, nada gravado);
- aviso de id desconhecido (200, nada gravado);
- estado vazio, carregando e erro na tela;
- 390px e desktop;
- o estado final dos dados de prova depois do teste.

Se o modo for planejar, pare aqui e devolva o roadmap.

## Etapa 3 — Implementar

- Siga o estilo do código ao redor: nomes, densidade de comentário, idioma.
- Comentário só para restrição que o código não mostra.
- Migration nova em supabase/migrations. RLS em toda tabela exposta. Escrita
  sensível por função em private, chamada por service_role.
- Uma Edge Function por sistema externo. Webhook com verify_jwt = false e
  autenticação pela assinatura.
- Lógica pura em _shared com teste Deno ao lado.
- Rode tsc no app e deno check nas funções antes do commit.
- Não mexa em arquivo fora do módulo. Arquivo sujo que não é seu fica fora
  do commit.

## Etapa 4 — Publicar

1. Commit no formato tipo(area): motivo em português.
2. Branch, PR e push conforme CONTRIBUTING.md e DEVELOPMENT_WORKFLOW.md.
3. supabase db push --linked, se houve migration.
4. supabase functions deploy <nome> --project-ref otddminugslmacdirual, se
   houve função.
5. Espere o deploy do Vercel desse commit ficar READY. Anote o id.

## Etapa 5 — Provar em produção

Rode cada parâmetro na URL publicada e no projeto detoxpass. Para cada um,
guarde a evidência: status HTTP, id da linha, texto da tela, contagem antes e
depois.

Dados de prova:
- Use só as contas e fichas liberadas no pedido.
- Fotografe o estado antes. Ao fim, devolva tudo ao estado anterior:
  ficha inativa volta inativa, origem volta à agenda de antes, trigger
  desligado volta ligado.
- Não deixe reserva viva na agenda de fora nem aqui.
- Se precisar ligar algo só para a prova, desligue no bloco finally do
  script, mesmo quando a prova falha.

Se um parâmetro falhar, corrija, publique de novo e rode outra vez. Se a
correção sair do escopo, registre a falha e pare.

## Etapa 6 — Relatório de aceite

Crie docs/aceite/ROADMAP-{{SLUG}}-ACEITE.md seguindo
docs/templates/ACEITE-MODELO.md. Atualize a coluna de resultado no roadmap.

- "Passou." só com evidência dessa rodada.
- "Falhou." com o que respondeu.
- "Ainda não rodou." quando não houve prova. Não troque por "deve funcionar".
- Termine com "O que este aceite não diz".

Um relatório longo de leitura (estado do banco, mapa de funções) vai em
docs/relatorios/, com data no nome.

## Resposta final

Comece pelo resultado: o que está no ar e o que a produção respondeu. Depois,
o que ficou de fora e por quê. Cite commit, deploy e arquivos. Não repita
segredo. Não chame de homologado.

## Pare e pergunte quando

- o pedido depende de uma decisão de produto que DECISIONS.md não fecha;
- a prova exige mexer em dado real de cliente;
- falta uma credencial que não está no projeto;
- o pedido conflita com uma regra acima.
````

## O que o time ajusta

- Os campos do pedido.
- As fontes, se o módulo tiver spec própria.
- As regras de prova de um sistema externo novo, como sandbox e webhook.

O resto vale para todo módulo.
