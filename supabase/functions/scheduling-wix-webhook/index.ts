import { json, serviceClient } from '../_shared/supabase.ts'
import {
  decideWixEvent,
  jwtFromBody,
  normalizePem,
  parseWixWebhookClaims,
  verifyWixJwt,
  wallTimeToUtc,
  wixEventKind,
} from '../_shared/wix.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const raw = await req.text()
  const token = jwtFromBody(raw)
  const keys = await publicKeys()
  if (keys.length === 0) return json({ error: 'assinatura ausente' }, 401)

  let claims: Record<string, unknown> | null = null
  for (const key of keys) {
    claims = await verifyWixJwt(key, token)
    if (claims) break
  }
  if (!claims) return json({ error: token.trim() ? 'assinatura inválida' : 'assinatura ausente' }, 401)

  const event = parseWixWebhookClaims(claims)
  if (!event?.entityId) return json({ ok: true, ignored: true })

  const admin = serviceClient()
  const { data: local } = await admin
    .from('bookings')
    .select('id, saga_status, starts_at')
    .eq('provider', 'wix')
    .eq('external_booking_id', event.entityId)
    .maybeSingle()

  const externalStarts = eventInstant(event.startAt, event.timeZone)
  const decision = decideWixEvent({
    kind: wixEventKind(event.slug),
    hasLocal: Boolean(local),
    localStatus: local?.saga_status ?? null,
    localStartsAt: local?.starts_at ?? null,
    externalStartsAt: externalStarts,
  })

  if (decision.kind === 'ignore' || decision.kind === 'duplicate' || !local) {
    return json({ ok: true, ignored: decision.kind !== 'duplicate', duplicate: decision.kind === 'duplicate' })
  }

  if (decision.kind === 'cancel') {
    const { error } = await admin.rpc('mark_cancelled', { p_booking_id: local.id })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status: 'cancelled' })
  }

  if (decision.kind === 'confirm') {
    const { error } = await admin.rpc('mark_provider_confirmed', {
      p_booking_id: local.id,
      p_external_booking_id: event.entityId,
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status: 'provider_confirmed' })
  }

  const { error } = await admin.rpc('mark_rescheduled', {
    p_booking_id: local.id,
    p_starts_at: decision.startsAt,
    p_origin: 'wix',
  })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, status: 'provider_confirmed' })
})

async function publicKeys() {
  const fromEnv = normalizePem(Deno.env.get('WIX_WEBHOOK_PUBLIC_KEY') ?? '')
  const keys = fromEnv.includes('BEGIN PUBLIC KEY') ? [fromEnv] : []
  const { data } = await serviceClient().from('schedule_connections').select('id').eq('provider', 'wix')
  for (const row of data ?? []) {
    const { data: secret } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: row.id })
    if (typeof secret !== 'string') continue
    try {
      const parsed = JSON.parse(secret) as { publicKeyPem?: string }
      const pem = normalizePem(parsed.publicKeyPem ?? '')
      if (pem.includes('BEGIN PUBLIC KEY') && !keys.includes(pem)) keys.push(pem)
    } catch {
      continue
    }
  }
  return keys
}

function eventInstant(start: string | null, timeZone: string | null) {
  if (!start) return null
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(start)) {
    const parsed = Date.parse(start)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }
  if (!timeZone) return null
  return wallTimeToUtc(start, timeZone)
}
