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
