import {
  SQUARE_OAUTH_REDIRECT_URL,
  SQUARE_SCOPES,
  SQUARE_WEBHOOK_URL,
  acceptSquareWebhook,
  availabilityTimes,
  decideSquareEvent,
  durationMinutes,
  localDate,
  futureWindow,
  monthBounds,
  readOAuthState,
  shouldRefreshSquareToken,
  signOAuthState,
  signaturesMatch,
  squareAuthorizeUrl,
  squareHost,
  squareReturnUrl,
  squareSignature,
  zonedDayRange,
} from './square.ts'

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
  }
}

const body = '{"type":"booking.updated","event_id":"evt-1"}'
const key = 'square-test-key'

Deno.test('assinatura Square usa a URL cadastrada mais o corpo', async () => {
  const signature = await squareSignature(key, SQUARE_WEBHOOK_URL, body)
  assertEquals(signature, '+6XTcJuCwCwPU0qln2H3RfPbKmuErLklMDLvUScm7N8=', 'vetor fixo')
  assertEquals(signaturesMatch(signature, signature), true, 'igual')
  assertEquals(signaturesMatch(signature, signature.slice(0, -1) + 'A'), false, 'último byte')
  assertEquals(signaturesMatch(signature, ''), false, 'vazia')
  const otherUrl = await squareSignature(key, `${SQUARE_WEBHOOK_URL}/`, body)
  assertEquals(signaturesMatch(signature, otherUrl), false, 'barra extra')
  const otherKey = await squareSignature('other-key', SQUARE_WEBHOOK_URL, body)
  assertEquals(signaturesMatch(signature, otherKey), false, 'outra chave')
})

Deno.test('host da Square não cai em produção por omissão', () => {
  assertEquals(squareHost('sandbox'), 'https://connect.squareupsandbox.com', 'sandbox')
  assertEquals(squareHost('production'), 'https://connect.squareup.com', 'produção')
  assertEquals(squareHost('test'), null, 'ambiente desconhecido')
  assertEquals(squareHost(null), null, 'ambiente vazio')
})

Deno.test('duração vem dos milissegundos do catálogo', () => {
  assertEquals(durationMinutes(1800000), 30, 'trinta minutos')
  assertEquals(durationMinutes(0), null, 'zero')
  assertEquals(durationMinutes(60000), null, 'abaixo de cinco')
  assertEquals(durationMinutes('1800000'), null, 'texto')
})

Deno.test('dia no fuso da unidade vira intervalo UTC', () => {
  assertEquals(
    zonedDayRange('2026-10-07', 'America/New_York'),
    { start: '2026-10-07T04:00:00Z', end: '2026-10-08T04:00:00Z' },
    'nova york em outubro',
  )
  assertEquals(
    zonedDayRange('2026-10-07', 'America/Sao_Paulo'),
    { start: '2026-10-07T03:00:00Z', end: '2026-10-08T03:00:00Z' },
    'são paulo',
  )
  assertEquals(zonedDayRange('07-10-2026', 'America/New_York'), null, 'data inválida')
  assertEquals(localDate('2026-10-07T17:00:00Z', 'America/New_York'), '2026-10-07', 'tarde em nova york')
  assertEquals(localDate('2026-10-08T02:30:00Z', 'America/Sao_Paulo'), '2026-10-07', 'noite em são paulo')
})

Deno.test('mês cabe na janela da busca da Square', () => {
  assertEquals(monthBounds('2026-10'), { start: '2026-10-01', end: '2026-11-01' }, 'outubro')
  assertEquals(monthBounds('2026-12'), { start: '2026-12-01', end: '2027-01-01' }, 'dezembro')
  assertEquals(monthBounds('2026-13'), null, 'mês inválido')
})

Deno.test('disponibilidade lê só start_at', () => {
  assertEquals(
    availabilityTimes({
      availabilities: [
        { start_at: '2026-10-07T17:00:00Z' },
        { start_at: 1 },
        null,
      ],
    }),
    ['2026-10-07T17:00:00Z'],
    'um horário',
  )
  assertEquals(availabilityTimes({}), [], 'sem lista')
})

Deno.test('busca da Square não começa no passado', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  assertEquals(futureWindow('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', now)?.start, '2026-10-06T12:01:00Z', 'mês corrente')
  assertEquals(futureWindow('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', now)?.start, '2026-11-01T00:00:00Z', 'mês futuro')
  assertEquals(futureWindow('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', now), null, 'mês passado')
})

Deno.test('aviso da Square não inventa reserva local', () => {
  const missing = decideSquareEvent({
    type: 'booking.updated',
    status: 'CANCELLED_BY_SELLER',
    startAt: '2026-10-07T18:00:00Z',
    hasLocal: false,
    localStatus: null,
    localStartsAt: null,
  })
  assertEquals(missing, { kind: 'ignore' }, 'id desconhecido')
  const created = decideSquareEvent({
    type: 'booking.created',
    status: 'ACCEPTED',
    startAt: '2026-10-07T17:00:00Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(created, { kind: 'ignore' }, 'criação já é nossa')
})

Deno.test('cancelamento e reagendamento da Square', () => {
  const seller = decideSquareEvent({
    type: 'booking.updated',
    status: 'CANCELLED_BY_SELLER',
    startAt: '2026-10-07T17:00:00Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(seller, { kind: 'cancel' }, 'vendedor')
  const buyer = decideSquareEvent({
    type: 'booking.updated',
    status: 'CANCELLED_BY_CUSTOMER',
    startAt: '2026-10-07T17:00:00Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(buyer, { kind: 'cancel' }, 'cliente')
  const again = decideSquareEvent({
    type: 'booking.updated',
    status: 'CANCELLED_BY_SELLER',
    startAt: '2026-10-07T17:00:00Z',
    hasLocal: true,
    localStatus: 'cancelled',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(again, { kind: 'duplicate' }, 'já cancelada')
  const moved = decideSquareEvent({
    type: 'booking.updated',
    status: 'ACCEPTED',
    startAt: '2026-10-07T18:00:00Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(moved, { kind: 'reschedule', startsAt: '2026-10-07T18:00:00Z' }, 'horário novo')
  const same = decideSquareEvent({
    type: 'booking.updated',
    status: 'ACCEPTED',
    startAt: '2026-10-07T17:00:00.000Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(same, { kind: 'ignore' }, 'mesmo instante')
  const noise = decideSquareEvent({
    type: 'booking.updated',
    status: 'ACCEPTED',
    startAt: null,
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(noise, { kind: 'ignore' }, 'versão sem horário')
  const other = decideSquareEvent({
    type: 'payment.updated',
    status: 'ACCEPTED',
    startAt: '2026-10-07T18:00:00Z',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T17:00:00Z',
  })
  assertEquals(other, { kind: 'ignore' }, 'outro evento')
})

Deno.test('login da Square pede só o escopo da agenda', () => {
  const sandbox = squareAuthorizeUrl('sandbox', 'sandbox-sq0idb-example', 'state-1')
  const live = squareAuthorizeUrl('production', 'sq0idp-example', 'state-2')
  if (!sandbox || !live) throw new Error('url vazia')
  const sandboxUrl = new URL(sandbox)
  const liveUrl = new URL(live)
  assertEquals(sandboxUrl.origin, 'https://connect.squareupsandbox.com', 'host sandbox')
  assertEquals(liveUrl.origin, 'https://connect.squareup.com', 'host produção')
  assertEquals(sandboxUrl.pathname, '/oauth2/authorize', 'caminho')
  assertEquals(sandboxUrl.searchParams.get('session'), null, 'sandbox sem session')
  assertEquals(liveUrl.searchParams.get('session'), 'false', 'produção exige login')
  assertEquals(sandboxUrl.searchParams.get('redirect_uri'), SQUARE_OAUTH_REDIRECT_URL, 'volta')
  assertEquals(sandboxUrl.searchParams.get('scope'), SQUARE_SCOPES.join(' '), 'escopo')
  assertEquals(SQUARE_SCOPES.some((scope) => scope.startsWith('PAYMENTS')), false, 'sem pagamento')
  assertEquals(squareAuthorizeUrl('test', 'id', 'state'), null, 'ambiente')
})

Deno.test('state do login não aceita troca nem prazo vencido', async () => {
  const secret = 'state-secret'
  const now = Date.parse('2026-10-06T15:00:00Z')
  const token = await signOAuthState(secret, {
    professionalId: '9a038721-84f0-4584-bf91-6e6a341ad9e0',
    environment: 'sandbox',
    surface: 'agenda',
    exp: Math.floor(now / 1000) + 60,
    nonce: 'nonce-1234',
  })
  const read = await readOAuthState(secret, token, now)
  assertEquals(read?.professionalId, '9a038721-84f0-4584-bf91-6e6a341ad9e0', 'profissional')
  assertEquals(await readOAuthState('other-secret', token, now), null, 'outra chave')
  assertEquals(await readOAuthState(secret, `${token}x`, now), null, 'assinatura trocada')
  assertEquals(await readOAuthState(secret, token, now + 120_000), null, 'vencido')
  assertEquals(squareReturnUrl('admin', '9a038721-84f0-4584-bf91-6e6a341ad9e0', 'choose'), 'https://detox-pass.vercel.app/admin/therapists/9a038721-84f0-4584-bf91-6e6a341ad9e0?square=choose', 'admin')
  assertEquals(squareReturnUrl('agenda', '9a038721-84f0-4584-bf91-6e6a341ad9e0', 'javascript:alert(1)'), 'https://detox-pass.vercel.app/agenda?square=error', 'resultado')
  assertEquals(squareReturnUrl('https://evil.example', '9a038721-84f0-4584-bf91-6e6a341ad9e0', 'connected'), 'https://detox-pass.vercel.app/agenda?square=connected', 'superfície')
})

Deno.test('token da Square renova em sete dias e perto do vencimento', () => {
  const now = Date.parse('2026-10-06T15:00:00Z')
  assertEquals(shouldRefreshSquareToken({ refreshToken: '', expiresAt: '2026-11-01T00:00:00Z', refreshedAt: '2026-10-06T00:00:00Z', now }), false, 'sem refresh')
  assertEquals(shouldRefreshSquareToken({
    refreshToken: 'refresh',
    expiresAt: '2026-11-05T00:00:00Z',
    refreshedAt: '2026-10-06T00:00:00Z',
    now,
  }), false, 'novo')
  assertEquals(shouldRefreshSquareToken({
    refreshToken: 'refresh',
    expiresAt: '2026-11-05T00:00:00Z',
    refreshedAt: '2026-09-28T00:00:00Z',
    now,
  }), true, 'sete dias')
  assertEquals(shouldRefreshSquareToken({
    refreshToken: 'refresh',
    expiresAt: '2026-10-13T00:00:00Z',
    refreshedAt: '2026-10-06T00:00:00Z',
    now,
  }), true, 'perto de vencer')
})

Deno.test('webhook aceita a chave de produção sem largar a do sandbox', async () => {
  const body = '{"type":"booking.updated"}'
  const sandbox = await squareSignature('sandbox-key', SQUARE_WEBHOOK_URL, body)
  const production = await squareSignature('production-key', SQUARE_WEBHOOK_URL, body)
  assertEquals(await acceptSquareWebhook(['sandbox-key', ''], SQUARE_WEBHOOK_URL, body, ''), 'missing', 'sem assinatura')
  assertEquals(await acceptSquareWebhook(['', ''], SQUARE_WEBHOOK_URL, body, sandbox), 'missing', 'sem chave')
  assertEquals(await acceptSquareWebhook(['sandbox-key', 'production-key'], SQUARE_WEBHOOK_URL, body, sandbox), 'ok', 'sandbox')
  assertEquals(await acceptSquareWebhook(['sandbox-key', 'production-key'], SQUARE_WEBHOOK_URL, body, production), 'ok', 'produção')
  assertEquals(await acceptSquareWebhook(['sandbox-key', 'production-key'], SQUARE_WEBHOOK_URL, body, 'nope'), 'invalid', 'errada')
})
