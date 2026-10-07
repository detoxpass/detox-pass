export const WIX_OAUTH_REDIRECT_URL = 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-wix-oauth'
export const WIX_WEBHOOK_URL = 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-wix-webhook'
export const WIX_APP_ORIGIN = 'https://detox-pass.vercel.app'

export type WixEventKind = 'created' | 'confirmed' | 'updated' | 'canceled' | 'other'
export type WixDecision =
  | { kind: 'ignore' }
  | { kind: 'duplicate' }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'reschedule'; startsAt: string }

export type WixServiceChoice = {
  id: string
  name: string
  scheduleId: string
  staffId: string
  online: boolean
  inPerson: boolean
}

export type WixSlot = {
  start: string
  end: string
  scheduleId: string
  time: string
}

export type WixOAuthState = {
  professionalId: string
  surface: 'agenda' | 'admin'
  exp: number
  nonce: string
}

export function wixEventKind(slug: string): WixEventKind {
  const text = slug.toLowerCase()
  if (text.includes('cancel')) return 'canceled'
  if (text.includes('confirm')) return 'confirmed'
  if (text.includes('reschedul') || text.includes('update')) return 'updated'
  if (text.includes('creat')) return 'created'
  return 'other'
}

export function decideWixEvent(input: {
  kind: WixEventKind
  hasLocal: boolean
  localStatus: string | null
  localStartsAt: string | null
  externalStartsAt: string | null
}): WixDecision {
  if (!input.hasLocal) return { kind: 'ignore' }
  if (input.localStatus === 'cancelled') {
    return input.kind === 'canceled' ? { kind: 'duplicate' } : { kind: 'ignore' }
  }
  if (input.kind === 'created' || input.kind === 'other') return { kind: 'ignore' }
  if (input.kind === 'canceled') return { kind: 'cancel' }
  if (input.kind === 'confirmed') {
    return input.localStatus === 'intent' ? { kind: 'confirm' } : { kind: 'ignore' }
  }
  if (!input.externalStartsAt || !input.localStartsAt) return { kind: 'ignore' }
  if (Date.parse(input.externalStartsAt) === Date.parse(input.localStartsAt)) return { kind: 'ignore' }
  if (!Number.isFinite(Date.parse(input.externalStartsAt))) return { kind: 'ignore' }
  return { kind: 'reschedule', startsAt: new Date(input.externalStartsAt).toISOString() }
}

export function parseWixWebhookClaims(claims: Record<string, unknown>): {
  instanceId: string
  slug: string
  entityId: string
  status: string | null
  startAt: string | null
  timeZone: string | null
} | null {
  const data = unwrap(claims.data) ?? claims
  const slug = text(data.slug) || text(claims.eventType) || text(data.eventType)
  const entity = bookingEntity(data)
  const instanceId = text(claims.instanceId) || text(data.instanceId)
  const entityId = text(data.entityId) || text(entity?.id)
  if (!instanceId || !slug) return null
  const slot = entity ? slotOf(entity) : null
  return {
    instanceId,
    slug,
    entityId,
    status: entity ? text(entity.status) || null : null,
    startAt: slot?.start ?? null,
    timeZone: slot?.timeZone ?? null,
  }
}

export function appointmentChoices(payload: unknown): WixServiceChoice[] {
  const root = asRecord(payload)
  const rows = root && Array.isArray(root.services) ? root.services : []
  const choices: WixServiceChoice[] = []
  for (const row of rows) {
    const service = asRecord(row)
    if (!service || text(service.type) !== 'APPOINTMENT' || service.hidden === true) continue
    const id = text(service.id)
    const scheduleId = text(asRecord(service.schedule)?.id)
    const staff = Array.isArray(service.staffMemberIds) ? service.staffMemberIds.map(text).find(Boolean) ?? '' : ''
    if (!id || !scheduleId || !staff) continue
    const payment = asRecord(service.payment)
    const options = asRecord(payment?.options)
    const price = asRecord(asRecord(payment?.fixed)?.price)
    const amount = text(price?.value)
    const currency = text(price?.currency)
    const label = amount && currency ? `${text(service.name)} · ${amount} ${currency}` : text(service.name)
    choices.push({
      id,
      name: label || id,
      scheduleId,
      staffId: staff,
      online: options?.online === true,
      inPerson: options?.inPerson === true,
    })
  }
  return choices
}

export function slotsFromPayload(payload: unknown, timeZone: string): WixSlot[] {
  const root = asRecord(payload)
  const rows = root && Array.isArray(root.timeSlots) ? root.timeSlots : []
  const slots: WixSlot[] = []
  for (const row of rows) {
    const slot = asRecord(row)
    if (!slot || slot.bookable === false) continue
    const start = text(slot.localStartDate)
    const end = text(slot.localEndDate)
    const scheduleId = text(slot.scheduleId)
    const time = start ? wallTimeToUtc(start, timeZone) : null
    if (!start || !end || !scheduleId || !time) continue
    slots.push({ start, end, scheduleId, time })
  }
  return slots
}

export function confirmsWithoutWixCart(service: { online: boolean }): boolean {
  return service.online !== true
}

export function wallTimeToUtc(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local)
  if (!match || !timeZone) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] ?? '0')
  let utc = Date.UTC(year, month - 1, day, hour, minute, second)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seen = zoneParts(new Date(utc), timeZone)
    const seenStamp = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second)
    if (wanted === seenStamp) return new Date(utc).toISOString().replace('.000Z', 'Z')
    utc += wanted - seenStamp
  }
  return null
}

export function localWall(iso: string, timeZone: string): string | null {
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  const seen = zoneParts(instant, timeZone)
  const month = String(seen.month).padStart(2, '0')
  const day = String(seen.day).padStart(2, '0')
  const hour = String(seen.hour).padStart(2, '0')
  const minute = String(seen.minute).padStart(2, '0')
  const second = String(seen.second).padStart(2, '0')
  return `${seen.year}-${month}-${day}T${hour}:${minute}:${second}`
}

export function durationMinutes(startIso: string, endLocal: string, timeZone: string): number | null {
  const end = wallTimeToUtc(endLocal, timeZone)
  if (!end) return null
  const minutes = Math.round((Date.parse(end) - Date.parse(startIso)) / 60000)
  if (minutes < 5 || minutes > 480) return null
  return minutes
}

export function wixInstallUrl(appId: string, state: string, shareUrlId = ''): string | null {
  if (!appId || !state) return null
  const params = new URLSearchParams({
    appId,
    postInstallationUrl: `${WIX_OAUTH_REDIRECT_URL}?state=${encodeURIComponent(state)}`,
  })
  if (shareUrlId) params.set('shareUrlId', shareUrlId)
  return `https://www.wix.com/app-installer?${params}`
}

export function wixReturnUrl(surface: string, professionalId: string, result: string): string {
  const safe = ['connected', 'choose', 'denied', 'error'].includes(result) ? result : 'error'
  if (surface === 'admin' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professionalId)) {
    return `${WIX_APP_ORIGIN}/admin/therapists/${professionalId}?wix=${safe}`
  }
  return `${WIX_APP_ORIGIN}/integrations?wix=${safe}`
}

export function normalizePem(value: string): string {
  return value.trim().replaceAll('\\n', '\n')
}

export async function signWixState(secret: string, state: WixOAuthState): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)))
  const signature = bytesToBase64Url(await hmacSha256(secret, payload))
  return `${payload}.${signature}`
}

export async function readWixState(secret: string, token: string, now = Date.now()): Promise<WixOAuthState | null> {
  if (!secret || !token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = bytesToBase64Url(await hmacSha256(secret, payload))
  if (!fixedEqual(expected, signature)) return null
  const bytes = base64UrlToBytes(payload)
  if (!bytes) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<WixOAuthState>
    if (!parsed.professionalId || !/^[0-9a-f-]{36}$/i.test(parsed.professionalId)) return null
    if (parsed.surface !== 'agenda' && parsed.surface !== 'admin') return null
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= now) return null
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length < 8) return null
    return parsed as WixOAuthState
  } catch {
    return null
  }
}

export async function verifyWixJwt(publicKeyPem: string, token: string): Promise<Record<string, unknown> | null> {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  const header = decodeJson(parts[0])
  if (!header || header.alg !== 'RS256') return null
  const key = await importRsaPublicKey(publicKeyPem)
  if (!key) return null
  const signature = base64UrlToBytes(parts[2])
  if (!signature) return null
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    copyBytes(signature),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  ).catch(() => false)
  if (!valid) return null
  const claims = decodeJson(parts[1])
  return claims
}

export async function verifyInstallProof(input: {
  appSecret: string
  publicKeyPem: string
  signedInstance: string
  instanceId: string
}): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(input.instanceId)) return false
  const token = input.signedInstance.trim()
  const pieces = token.split('.')
  if (pieces.length === 3) {
    const claims = await verifyWixJwt(input.publicKeyPem, token)
    const found = claims ? text(claims.instanceId) : ''
    return found === input.instanceId
  }
  if (pieces.length !== 2 || !input.appSecret) return false
  const expected = await hmacSha256(input.appSecret, pieces[1])
  const given = base64UrlToBytes(pieces[0]) ?? base64ToBytes(pieces[0])
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < given.length; index += 1) diff |= given[index] ^ expected[index]
  if (diff !== 0) return false
  const payload = decodeJson(pieces[1])
  const found = payload ? text(payload.instanceId) : ''
  return !found || found === input.instanceId
}

export function jwtFromBody(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('eyJ')) return trimmed
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'string' && parsed.startsWith('eyJ')) return parsed
  } catch {
    return trimmed
  }
  return trimmed
}

function bookingEntity(event: Record<string, unknown>): Record<string, unknown> | null {
  const created = asRecord(asRecord(event.createdEvent)?.entity)
  const confirmed = asRecord(asRecord(event.confirmedEvent)?.entity)
  const canceled = asRecord(asRecord(event.canceledEvent)?.entity) ?? asRecord(asRecord(event.cancelledEvent)?.entity)
  const updated = asRecord(asRecord(event.updatedEvent)?.currentEntity)
  const action = asRecord(asRecord(asRecord(event.actionEvent)?.body)?.booking)
  return created ?? confirmed ?? canceled ?? updated ?? action ?? asRecord(event.entity) ?? null
}

function slotOf(entity: Record<string, unknown>): { start: string; timeZone: string } | null {
  const booked = asRecord(entity.bookedEntity)
  const slot = asRecord(booked?.slot)
  const start = text(slot?.startDate)
  const timeZone = text(slot?.timezone)
  if (!start || !timeZone) return null
  return { start, timeZone }
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return null
    }
  }
  return asRecord(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function decodeJson(segment: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(segment)
  if (!bytes) return null
  try {
    return asRecord(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

function zoneParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  let hour = Number(bag.hour)
  let day = Number(bag.day)
  let month = Number(bag.month)
  let year = Number(bag.year)
  if (hour === 24) {
    hour = 0
    const rolled = new Date(Date.UTC(year, month - 1, day))
    rolled.setUTCDate(rolled.getUTCDate() + 1)
    year = rolled.getUTCFullYear()
    month = rolled.getUTCMonth() + 1
    day = rolled.getUTCDate()
  }
  return { year, month, day, hour, minute: Number(bag.minute), second: Number(bag.second) }
}

async function importRsaPublicKey(pem: string): Promise<CryptoKey | null> {
  const body = normalizePem(pem).replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s/g, '')
  if (!body) return null
  const bytes = base64ToBytes(body)
  if (!bytes) return null
  try {
    return await crypto.subtle.importKey(
      'spki',
      copyBytes(bytes),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch {
    return null
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let textValue = ''
  for (const byte of bytes) textValue += String.fromCharCode(byte)
  return btoa(textValue).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  return base64ToBytes(value.replaceAll('-', '+').replaceAll('_', '/'))
}

function base64ToBytes(value: string): Uint8Array | null {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))
  return new Uint8Array(signed)
}

function fixedEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return diff === 0
}
