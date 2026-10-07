# 10 — Chat com agente de IA

## Norma

O chat é o módulo 12 e faz parte do escopo desde a Fase 02. Ele ajuda a cliente
a encontrar **serviço**, **cidade** e **profissional**.

O provedor desta fase é a OpenAI. A transcrição e a conversa com tool calling
ficam atrás da Edge Function `chat`. O nome do modelo de conversa é variável
da função. Trocar esse nome não muda as regras abaixo. A decisão está em
[`docs/DECISIONS.md`](../docs/DECISIONS.md), seção "O agente reserva pelo
comando que a tela já usa". O corte de implementação, os tetos e os testes
estão em [`docs/ROADMAP-AGENTE.md`](../docs/roadmap/ROADMAP-AGENTE.md).

## O que o agente pode usar

- Catálogo do Detox Pass.
- Cidades cadastradas.
- Serviços cadastrados.
- Profissionais ativas.
- Informação que já esteja disponível na plataforma.

Se o dado não está na plataforma, o agente não completa com conhecimento
externo para parecer útil. Ausência de profissional na cidade é uma resposta
válida. Inventar profissional não é.

## O que o agente não faz

| Proibição | Por quê |
| --------- | ------- |
| Inventar horário | Horário vem da grade da profissional, na ferramenta de agenda, e a reserva revalida esse instante. |
| Substituir a API de agenda | A ferramenta de agendar chama a ação `book` já publicada. Não existe uma segunda saga. |
| Cobrar | Cobrança é Stripe, fora do chat. A reserva interna continua com `amount_cents` nulo. |
| Liberar payout | Liberação é operação ou regra, depois da confirmação da cliente. |
| Decidir pela cliente | O modelo mostra horários que a grade devolveu. Quem reserva é o toque da cliente nesse horário. |
| Dar orientação clínica | O produto não é atendimento de saúde por conversa. |
| Chamar integração de homologada se o teste autenticado não ocorreu | Homologação é fato de teste, não adjetivo do modelo. |

O agente também não cria serviço, cidade, profissional, pagamento,
confirmação nem reward. Ele só abre reserva pelo comando que a tela da
cliente já usa, com um horário que a ferramenta de agenda devolveu para
aquela conversa e que a cliente tocou. Texto livre do modelo não reserva.

## Fluxo obrigatório depois da conversa

```
Chat
  → busca no catálogo
  → ficha e grade reais
  → a cliente toca um horário devolvido
  → o mesmo book da tela
  → Stripe continua fora desta conversa
```

A conversa pode terminar na ficha ou numa reserva `provider_confirmed` da
agenda interna. Do toque em diante vale [Reservas](./06-reservas.md). Não há
saga paralela. Agenda externa sem credencial daquela ficha responde pendente
e não inventa horário.

## Comportamento esperado da conversa

1. A cliente diz o que procura, em linguagem livre, incluindo cidade ou serviço
   quando souber.
2. O agente restringe a busca a profissionais ativas e ao catálogo.
3. O agente devolve opções reais ou diz que não há opção com os filtros dados.
4. A cliente escolhe uma ficha ou pede a grade.
5. A grade, se for mostrada, é a que a ferramenta leu. O toque num desses
   horários é o único jeito de reservar dentro do chat.

Se o modelo alucinar um horário e a interface deixar reservar esse horário, o
defeito é do produto, não um detalhe do prompt.

## Segurança e dados

- O chat não recebe secret de Stripe, `service_role` nem credencial de agenda
  para "facilitar" uma resposta.
- O chat não é canal para colar dado real de usuário em prompt de desenvolvimento.
  Isso é regra do playbook para o time, e o produto também não deve vazar PII
  de uma cliente na sessão de outra.
- Isolamento entre clientes: o agente da cliente A não usa histórico da cliente
  B para recomendar.
- A Edge Function `chat` lê o catálogo com o JWT da cliente, de modo que a RLS
  se aplique. Ela não usa `service_role` para enxergar profissional inativa e
  filtrar depois no prompt.

**Em aberto.** Retenção da conversa, se a operação pode ler transcrições, e a
base legal disso. Não especificado.

## Critérios de aceite

- Pergunta por serviço e cidade devolve só profissional ativa daquele recorte,
  ou resposta explícita de que não há.
- Nenhuma resposta do chat cria cobrança, payout ou reward.
- Horário só aparece se a ferramenta de agenda o leu naquele turno.
- Reservar sem o toque da cliente nesse horário não cria `bookings`.
- O texto do agente não orienta conduta clínica.
- Trocar o nome do modelo não muda estas regras. O domínio do chat não fica
  acoplado a um SDK na tela.

## Em aberto

- Retenção da conversa, se a operação pode ler transcrições, e a base legal.
- Memória entre sessões além das últimas mensagens desta conversa.
- Idioma fixo além do inglês da interface. A cliente pode escrever em
  português. As ferramentas respondem com os nomes do catálogo.
