import {
  appointmentChoices,
  confirmsWithoutWixCart,
  decideWixEvent,
  parseWixWebhookClaims,
  signWixState,
  slotsFromPayload,
  verifyInstallProof,
  verifyWixJwt,
  wallTimeToUtc,
  wixEventKind,
  wixInstallUrl,
  readWixState,
} from './wix.ts'

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
  }
}

Deno.test('horário de São Paulo vira UTC', () => {
  assertEquals(wallTimeToUtc('2026-10-07T10:00:00', 'America/Sao_Paulo'), '2026-10-07T13:00:00Z', '10:00')
  assertEquals(wallTimeToUtc('2026-10-07', 'America/Sao_Paulo'), null, 'sem hora')
})

Deno.test('aviso da Wix separa criar, confirmar, mover e cancelar', () => {
  assertEquals(wixEventKind('wix.bookings.v2.booking_created'), 'created', 'criar')
  assertEquals(wixEventKind('booking_confirmed'), 'confirmed', 'confirmar')
  assertEquals(wixEventKind('booking_updated'), 'updated', 'mover')
  assertEquals(wixEventKind('booking_canceled'), 'canceled', 'cancelar')
  assertEquals(decideWixEvent({
    kind: 'created',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: '2026-10-07T13:00:00Z',
  }), { kind: 'ignore' }, 'criar ignora')
  assertEquals(decideWixEvent({
    kind: 'canceled',
    hasLocal: false,
    localStatus: null,
    localStartsAt: null,
    externalStartsAt: null,
  }), { kind: 'ignore' }, 'id desconhecido')
  assertEquals(decideWixEvent({
    kind: 'canceled',
    hasLocal: true,
    localStatus: 'cancelled',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: null,
  }), { kind: 'duplicate' }, 'cancelar de novo')
  assertEquals(decideWixEvent({
    kind: 'canceled',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: null,
  }), { kind: 'cancel' }, 'cancelar')
  assertEquals(decideWixEvent({
    kind: 'confirmed',
    hasLocal: true,
    localStatus: 'intent',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: '2026-10-07T13:00:00Z',
  }), { kind: 'confirm' }, 'confirmar a intenção')
  assertEquals(decideWixEvent({
    kind: 'confirmed',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: '2026-10-07T13:00:00Z',
  }), { kind: 'ignore' }, 'já confirmada')
  assertEquals(decideWixEvent({
    kind: 'updated',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: '2026-10-07T14:00:00Z',
  }), { kind: 'reschedule', startsAt: '2026-10-07T14:00:00.000Z' }, 'horário novo')
  assertEquals(decideWixEvent({
    kind: 'updated',
    hasLocal: true,
    localStatus: 'provider_confirmed',
    localStartsAt: '2026-10-07T13:00:00Z',
    externalStartsAt: '2026-10-07T13:00:00.000Z',
  }), { kind: 'ignore' }, 'mesmo instante')
})

Deno.test('JWT do webhook só passa com a chave que assinou', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pem = await pemOf(pair.publicKey)
  const otherPem = await pemOf(other.publicKey)
  const claims = {
    instanceId: '4f8cda49-3813-4c19-8596-d6f39bcdc823',
    eventType: 'wix.bookings.v2.booking_canceled',
    data: JSON.stringify({
      slug: 'canceled',
      entityId: 'booking-1',
      canceledEvent: { entity: { id: 'booking-1', status: 'CANCELED' } },
    }),
  }
  const token = await signJwt(pair.privateKey, claims)
  const verified = await verifyWixJwt(pem, token)
  assertEquals(Boolean(verified), true, 'chave certa')
  assertEquals(await verifyWixJwt(otherPem, token), null, 'outra chave')
  assertEquals(await verifyWixJwt(pem, `${token}x`), null, 'assinatura cortada')
  assertEquals(parseWixWebhookClaims(verified ?? {}), {
    instanceId: '4f8cda49-3813-4c19-8596-d6f39bcdc823',
    slug: 'canceled',
    entityId: 'booking-1',
    status: 'CANCELED',
    startAt: null,
    timeZone: null,
  }, 'corpo')
})

Deno.test('instalação confere a instance assinada e pede escolha quando há mais de um serviço', async () => {
  const secret = 'state-secret'
  const state = await signWixState(secret, {
    professionalId: '9a038721-84f0-4584-bf91-6e6a341ad9e0',
    surface: 'agenda',
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: 'nonce-1234',
  })
  assertEquals((await readWixState(secret, state))?.professionalId, '9a038721-84f0-4584-bf91-6e6a341ad9e0', 'state')
  assertEquals(await readWixState('other', state), null, 'state de outra chave')
  const url = wixInstallUrl('app-1', state)
  assertEquals(url?.startsWith('https://www.wix.com/app-installer?'), true, 'instalador')
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pem = await pemOf(pair.publicKey)
  const instanceId = '4f8cda49-3813-4c19-8596-d6f39bcdc823'
  const signed = await signJwt(pair.privateKey, { instanceId })
  assertEquals(await verifyInstallProof({ appSecret: 'app-secret', publicKeyPem: pem, signedInstance: signed, instanceId }), true, 'prova')
  assertEquals(await verifyInstallProof({ appSecret: 'app-secret', publicKeyPem: pem, signedInstance: signed, instanceId: '00000000-0000-4000-8000-000000000000' }), false, 'instance trocada')
  const services = appointmentChoices({
    services: [
      { id: 'svc-1', name: 'Detox Facial', type: 'APPOINTMENT', schedule: { id: 'sch-1' }, staffMemberIds: ['staff-1'], payment: { options: { online: false, inPerson: true } } },
      { id: 'svc-2', name: 'Consultoria Nutricional', type: 'APPOINTMENT', schedule: { id: 'sch-2' }, staffMemberIds: ['staff-1'], payment: { options: { online: true }, fixed: { price: { value: '70', currency: 'BRL' } } } },
    ],
  })
  assertEquals(services.length, 2, 'dois serviços')
  assertEquals(confirmsWithoutWixCart(services[0]), true, 'presencial')
  assertEquals(confirmsWithoutWixCart(services[1]), false, 'online')
  const slots = slotsFromPayload({
    timeSlots: [{ localStartDate: '2026-10-07T10:00:00', localEndDate: '2026-10-07T11:00:00', scheduleId: 'sch-2', bookable: true }],
  }, 'America/Sao_Paulo')
  assertEquals(slots[0]?.time, '2026-10-07T13:00:00Z', 'slot')
})

async function pemOf(key: CryptoKey) {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key))
  let binary = ''
  for (const byte of spki) binary += String.fromCharCode(byte)
  const body = btoa(binary).match(/.{1,64}/g)?.join('\n') ?? ''
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
}

async function signJwt(key: CryptoKey, claims: Record<string, unknown>) {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify(claims))
  const signed = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  ))
  return `${header}.${payload}.${base64UrlBytes(signed)}`
}

function base64Url(value: string) {
  return base64UrlBytes(new TextEncoder().encode(value))
}

function base64UrlBytes(bytes: Uint8Array) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
