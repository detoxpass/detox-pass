import { json, serviceClient } from '../_shared/supabase.ts'

const ACUITY = 'https://acuityscheduling.com/api/v1'

type Secret = { userId: string; apiKey: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const connectionId = new URL(req.url).searchParams.get('connection_id')
  if (!connectionId) return json({ error: 'connection_id obrigatório' }, 401)

  const raw = await req.text()
  const signature = req.headers.get('x-acuity-signature') ?? ''
  const secret = await readSecret(connectionId)
  if (!secret || !signature) return json({ error: 'assinatura ausente' }, 401)
  if (!await signaturesMatch(secret.apiKey, raw, signature)) return json({ error: 'assinatura inválida' }, 401)

  const form = new URLSearchParams(raw)
  const action = form.get('action') ?? ''
  const externalId = form.get('id') ?? ''
  if (!externalId) return json({ ignored: true })

  const admin = serviceClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, saga_status, starts_at')
    .eq('provider', 'acuity')
    .eq('external_booking_id', externalId)
    .maybeSingle()

  if (!booking) return json({ ignored: true })

  if (action === 'canceled' || action === 'appointment.canceled') {
    if (booking.saga_status === 'cancelled') return json({ ok: true, duplicate: true })
    const { error } = await admin.rpc('mark_cancelled', { p_booking_id: booking.id })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status: 'cancelled' })
  }

  if (action === 'rescheduled' || action === 'appointment.rescheduled') {
    const external = await acuityGet(secret, externalId)
    const startsAt = external?.datetime ?? ''
    if (!startsAt) return json({ status: 'pending', supported: false, detail: 'appointment sem datetime' }, 422)
    if (Date.parse(startsAt) === Date.parse(booking.starts_at)) return json({ ok: true, duplicate: true })
    const { error } = await admin.rpc('mark_rescheduled', {
      p_booking_id: booking.id,
      p_starts_at: startsAt,
      p_origin: 'acuity',
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status: 'provider_confirmed' })
  }

  return json({ ignored: true })
})

async function readSecret(connectionId: string): Promise<Secret | null> {
  const { data, error } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: connectionId })
  if (error || !data) return null
  try {
    const parsed = JSON.parse(data) as { userId?: string; apiKey?: string }
    if (!parsed.userId || !parsed.apiKey) return null
    return { userId: parsed.userId, apiKey: parsed.apiKey }
  } catch {
    return null
  }
}

async function signaturesMatch(secret: string, body: string, signature: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)))
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  }
  return diff === 0
}

async function acuityGet(secret: Secret, id: string) {
  const token = btoa(`${secret.userId}:${secret.apiKey}`)
  const response = await fetch(`${ACUITY}/appointments/${id}`, {
    headers: { authorization: `Basic ${token}`, accept: 'application/json' },
  })
  if (!response.ok) return null
  return response.json() as Promise<{ datetime?: string }>
}
