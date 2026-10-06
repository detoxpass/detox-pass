export const SQUARE_VERSION = '2025-01-23'
export const SQUARE_WEBHOOK_URL = 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-webhook'

export type SquareDecision =
  | { kind: 'ignore' }
  | { kind: 'duplicate' }
  | { kind: 'cancel' }
  | { kind: 'reschedule'; startsAt: string }

export function squareHost(environment: string | null | undefined): string | null {
  if (environment === 'sandbox') return 'https://connect.squareupsandbox.com'
  if (environment === 'production') return 'https://connect.squareup.com'
  return null
}

export function durationMinutes(milliseconds: unknown): number | null {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds <= 0) return null
  const minutes = Math.round(milliseconds / 60000)
  if (minutes < 5 || minutes > 480) return null
  return minutes
}

export async function squareSignature(key: string, notificationUrl: string, body: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(notificationUrl + body))
  return btoa(String.fromCharCode(...new Uint8Array(signed)))
}

export function signaturesMatch(expected: string, received: string): boolean {
  if (!expected || !received || expected.length !== received.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ received.charCodeAt(index)
  }
  return diff === 0
}

export function decideSquareEvent(input: {
  type: string
  status: string | null
  startAt: string | null
  hasLocal: boolean
  localStatus: string | null
  localStartsAt: string | null
}): SquareDecision {
  if (!input.hasLocal) return { kind: 'ignore' }
  if (input.type !== 'booking.updated') return { kind: 'ignore' }
  if (input.status?.startsWith('CANCELLED')) {
    return input.localStatus === 'cancelled' ? { kind: 'duplicate' } : { kind: 'cancel' }
  }
  if (!input.startAt || Number.isNaN(Date.parse(input.startAt))) return { kind: 'ignore' }
  if (input.localStartsAt && Date.parse(input.startAt) === Date.parse(input.localStartsAt)) return { kind: 'ignore' }
  return { kind: 'reschedule', startsAt: input.startAt }
}

export function availabilityTimes(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || !('availabilities' in payload)) return []
  const rows = (payload as { availabilities?: unknown }).availabilities
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || !('start_at' in row) || typeof row.start_at !== 'string') return []
    return [row.start_at]
  })
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

function zonedMidnight(date: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seen = zoneParts(new Date(utc), timeZone)
    const seenStamp = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
    const wanted = Date.UTC(year, month - 1, day, 0, 0, 0)
    const delta = wanted - seenStamp
    if (delta === 0) return new Date(utc)
    utc += delta
  }
  return null
}

export function zonedDayRange(date: string, timeZone: string): { start: string; end: string } | null {
  const start = zonedMidnight(date, timeZone)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!start || !match) return null
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  next.setUTCDate(next.getUTCDate() + 1)
  const endDate = next.toISOString().slice(0, 10)
  const end = zonedMidnight(endDate, timeZone)
  if (!end) return null
  return {
    start: start.toISOString().replace('.000Z', 'Z'),
    end: end.toISOString().replace('.000Z', 'Z'),
  }
}

export function localDate(iso: string, timeZone: string): string | null {
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return null
  const seen = zoneParts(instant, timeZone)
  const month = String(seen.month).padStart(2, '0')
  const day = String(seen.day).padStart(2, '0')
  return `${seen.year}-${month}-${day}`
}

export function futureWindow(start: string, end: string, now = Date.now()): { start: string; end: string } | null {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  const earliest = now + 60_000
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= earliest) return null
  const next = Math.max(startMs, earliest)
  if (next >= endMs) return null
  return {
    start: new Date(next).toISOString().replace('.000Z', 'Z'),
    end: new Date(endMs).toISOString().replace('.000Z', 'Z'),
  }
}

export const SQUARE_OAUTH_REDIRECT_URL = 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-oauth'
export const SQUARE_APP_ORIGIN = 'https://detox-pass.vercel.app'

export const SQUARE_SCOPES = [
  'APPOINTMENTS_READ',
  'APPOINTMENTS_ALL_READ',
  'APPOINTMENTS_WRITE',
  'APPOINTMENTS_ALL_WRITE',
  'MERCHANT_PROFILE_READ',
  'EMPLOYEES_READ',
  'ITEMS_READ',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
] as const

const SQUARE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SQUARE_REFRESH_WINDOW_MS = 8 * 24 * 60 * 60 * 1000

export type SquareOAuthState = {
  professionalId: string
  environment: 'sandbox' | 'production'
  surface: 'agenda' | 'admin'
  exp: number
  nonce: string
}

export function squareAuthorizeUrl(environment: string, clientId: string, state: string): string | null {
  const host = squareHost(environment)
  if (!host || !clientId || !state) return null
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SQUARE_SCOPES.join(' '),
    state,
    redirect_uri: SQUARE_OAUTH_REDIRECT_URL,
  })
  if (environment === 'production') params.set('session', 'false')
  return `${host}/oauth2/authorize?${params}`
}

export function squareReturnUrl(surface: string, professionalId: string, result: string): string {
  const safe = ['connected', 'choose', 'incomplete', 'denied', 'error'].includes(result) ? result : 'error'
  if (surface === 'admin' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professionalId)) {
    return `${SQUARE_APP_ORIGIN}/admin/therapists/${professionalId}?square=${safe}`
  }
  return `${SQUARE_APP_ORIGIN}/integrations?square=${safe}`
}

export function shouldRefreshSquareToken(input: {
  refreshToken?: string | null
  expiresAt?: string | null
  refreshedAt?: string | null
  now?: number
}): boolean {
  if (!input.refreshToken) return false
  const now = input.now ?? Date.now()
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN
  if (!Number.isFinite(expires) || expires - now <= SQUARE_REFRESH_WINDOW_MS) return true
  const refreshed = input.refreshedAt ? Date.parse(input.refreshedAt) : Number.NaN
  if (!Number.isFinite(refreshed) || now - refreshed >= SQUARE_WEEK_MS) return true
  return false
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
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

export async function signOAuthState(secret: string, state: SquareOAuthState): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(state)))
  const signature = bytesToBase64Url(await hmacSha256(secret, payload))
  return `${payload}.${signature}`
}

export async function readOAuthState(secret: string, token: string, now = Date.now()): Promise<SquareOAuthState | null> {
  if (!secret || !token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = bytesToBase64Url(await hmacSha256(secret, payload))
  if (!signaturesMatch(expected, signature)) return null
  const bytes = base64UrlToBytes(payload)
  if (!bytes) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SquareOAuthState>
    if (!parsed.professionalId || !/^[0-9a-f-]{36}$/i.test(parsed.professionalId)) return null
    if (parsed.environment !== 'sandbox' && parsed.environment !== 'production') return null
    if (parsed.surface !== 'agenda' && parsed.surface !== 'admin') return null
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= now) return null
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length < 8) return null
    return parsed as SquareOAuthState
  } catch {
    return null
  }
}

export async function acceptSquareWebhook(keys: string[], url: string, body: string, received: string): Promise<'missing' | 'invalid' | 'ok'> {
  const present = keys.filter((key) => key.length > 0)
  if (present.length === 0 || !received) return 'missing'
  for (const key of present) {
    const expected = await squareSignature(key, url, body)
    if (signaturesMatch(expected, received)) return 'ok'
  }
  return 'invalid'
}

export function monthBounds(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2])
  if (index < 1 || index > 12) return null
  const start = `${month}-01`
  const next = new Date(Date.UTC(year, index - 1, 1))
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { start, end: next.toISOString().slice(0, 10) }
}
