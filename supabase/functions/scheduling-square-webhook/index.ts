import { json, serviceClient } from '../_shared/supabase.ts'
import { SQUARE_WEBHOOK_URL, decideSquareEvent, signaturesMatch, squareSignature } from '../_shared/square.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const raw = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature') ?? ''
  const key = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? ''
  const notificationUrl = Deno.env.get('SQUARE_WEBHOOK_NOTIFICATION_URL') || SQUARE_WEBHOOK_URL
  if (!key || !signature) return json({ error: 'assinatura ausente' }, 401)
  const expected = await squareSignature(key, notificationUrl, raw)
  if (!signaturesMatch(expected, signature)) return json({ error: 'assinatura inválida' }, 401)

  let event: {
    type?: string
    data?: { object?: { booking?: { id?: string; status?: string; start_at?: string } } }
  }
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  const booking = event.data?.object?.booking
  const externalId = booking?.id ?? ''
  if (!externalId) return json({ ignored: true })

  const admin = serviceClient()
  const { data: local } = await admin
    .from('bookings')
    .select('id, saga_status, starts_at')
    .eq('provider', 'square')
    .eq('external_booking_id', externalId)
    .maybeSingle()

  const decision = decideSquareEvent({
    type: event.type ?? '',
    status: booking?.status ?? null,
    startAt: booking?.start_at ?? null,
    hasLocal: Boolean(local),
    localStatus: local?.saga_status ?? null,
    localStartsAt: local?.starts_at ?? null,
  })

  if (decision.kind === 'ignore' || decision.kind === 'duplicate' || !local) {
    return json({ ok: true, ignored: decision.kind !== 'duplicate', duplicate: decision.kind === 'duplicate' })
  }

  if (decision.kind === 'cancel') {
    const { error } = await admin.rpc('mark_cancelled', { p_booking_id: local.id })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, status: 'cancelled' })
  }

  const { error } = await admin.rpc('mark_rescheduled', {
    p_booking_id: local.id,
    p_starts_at: decision.startsAt,
    p_origin: 'square',
  })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, status: 'provider_confirmed' })
})
