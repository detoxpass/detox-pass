# Webhook da Square

Cole esta URL no aplicativo **sandbox** da Square, em Webhooks. Não use o aplicativo de produção. A URL entra inteira, sem barra no final e sem parâmetro.

```
https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-webhook
```

Eventos:

- `booking.created`
- `booking.updated`

Versão da API da assinatura: `2025-01-23`.

Depois de salvar, a Square mostra uma **Signature key**. Essa chave não vai no Git e não vai na URL. A do sandbox entra no secret `SQUARE_WEBHOOK_SIGNATURE_KEY`. A de produção, quando existir, entra em `SQUARE_WEBHOOK_SIGNATURE_KEY_PRODUCTION`. Sem chave, o endereço responde 401 e não grava nada. Uma assinatura errada também responde 401. As duas chaves são aceitas no mesmo endereço.

O login da profissional volta para outro endereço, `scheduling-square-oauth`. Esse não é o webhook. O passo a passo está em [`ROADMAP-SQUARE.md`](../roadmap/ROADMAP-SQUARE.md).

O aviso é o HMAC-SHA256 de `URL + corpo`, em base64, no header `x-square-hmacsha256-signature`. A URL assinada tem de ser exatamente a de cima.

O que o endereço faz com um aviso válido:

| Evento | Reserva já existe na plataforma | O que acontece |
| --- | --- | --- |
| `booking.updated` com status `CANCELLED_BY_SELLER` ou `CANCELLED_BY_CUSTOMER` | sim | cancela aqui. Repetir o aviso não cancela de novo. |
| `booking.updated` com `start_at` diferente | sim | grava o horário novo, origem `square`. |
| `booking.updated` sem mudança de horário nem cancelamento | sim | ignora. A Square também avisa mudança interna. |
| `booking.created` | sim ou não | ignora. A ida já criou a reserva. Um horário marcado só na Square não vira reserva daqui, porque não há cliente, serviço nem cidade. |
| qualquer aviso de um id que não está aqui | não | ignora. Não inventa reserva. |

A função da ida é `scheduling-square`: disponibilidade, criar, reagendar, cancelar e ler. O status da conexão continua `pending` até essa função publicada fechar o ciclo numa ficha ativa. Nada disso é homologação.
