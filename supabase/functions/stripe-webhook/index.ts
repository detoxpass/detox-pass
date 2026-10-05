import { json, preflight, serviceClient, type SupabaseClient } from '../_shared/supabase.ts'

type RpcError = { code?: string; message?: string }

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'STRIPE_WEBHOOK_SECRET ausente' }, 503)

  const payload = await req.text()
  const header = req.headers.get('stripe-signature')
  if (!header || !(await verifyStripeSignature(payload, header, secret))) {
    return json({ error: 'assinatura inválida' }, 400)
  }

  let event: {
    id?: string
    type?: string
    data?: { object?: Record<string, unknown> }
  }
  try {
    event = JSON.parse(payload)
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  const object = event.data?.object ?? {}
  const bookingId = metadataBookingId(object)
  if (!event.id || !bookingId) return json({ ignored: true })

  const admin = serviceClient()

  if (event.type === 'checkout.session.completed') {
    if (object.payment_status !== 'paid') {
      return json({ ignored: true, reason: 'pagamento não confirmado' })
    }

    const recorded = await admin.rpc('record_payment_event', {
      p_source: 'stripe',
      p_external_id: event.id,
      p_booking_id: bookingId,
      p_payload: event,
    })
    if (recorded.error || !recorded.data) {
      return json({ error: recorded.error?.message ?? 'não gravou o evento' }, 500)
    }

    let mismatch: string | null
    try {
      mismatch = await amountMismatch(admin, bookingId, object)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'falha ao ler a reserva'
      return json({ error: message }, 500)
    }
    if (mismatch) {
      await admin.rpc('mark_inbound_event_error', {
        p_event_id: recorded.data,
        p_message: mismatch,
      })
      return json({ accepted: false, error: mismatch })
    }

    const applied = await admin.rpc('apply_payment_event', { p_event_id: recorded.data })
    if (applied.error) return permanentOrRetry(admin, recorded.data, applied.error)
    return json({ ok: true })
  }

  if (event.type === 'charge.refunded') {
    const amount = Number(object.amount_refunded ?? 0)
    if (!Number.isInteger(amount) || amount < 0) {
      return json({ accepted: false, error: 'valor de reembolso inválido' })
    }
    const recorded = await admin.rpc('record_compensation', {
      p_booking_id: bookingId,
      p_amount_cents: amount,
      p_source: 'stripe',
      p_external_id: event.id,
      p_payload: event,
    })
    if (recorded.error) {
      if (isPermanent(recorded.error)) return json({ accepted: false, error: recorded.error.message })
      return json({ error: recorded.error.message }, 500)
    }
    return json({ ok: true })
  }

  return json({ ignored: true })
})

async function amountMismatch(
  admin: SupabaseClient,
  bookingId: string,
  object: Record<string, unknown>,
): Promise<string | null> {
  const { data: booking, error } = await admin
    .from('bookings')
    .select('amount_cents, currency')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!booking?.amount_cents || !booking.currency) return 'reserva sem valor'
  const paidAmount = Number(object.amount_total)
  const paidCurrency = typeof object.currency === 'string' ? object.currency.toUpperCase() : ''
  if (paidAmount !== booking.amount_cents || paidCurrency !== booking.currency) {
    return 'valor pago diferente da reserva'
  }
  return null
}

function isPermanent(error: RpcError): boolean {
  return error.code === '22023' || error.code === 'P0002'
}

async function permanentOrRetry(admin: SupabaseClient, eventId: string, error: RpcError): Promise<Response> {
  if (!isPermanent(error)) return json({ error: error.message ?? 'falha ao aplicar pagamento' }, 500)
  await admin.rpc('mark_inbound_event_error', {
    p_event_id: eventId,
    p_message: error.message ?? 'erro permanente',
  })
  return json({ accepted: false, error: error.message })
}

function metadataBookingId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const bookingId = (metadata as Record<string, unknown>).booking_id
  return typeof bookingId === 'string' && bookingId.length > 0 ? bookingId : null
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index)
    const value = part.slice(index + 1)
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

  return signatures.some((signature) => {
    if (hex.length !== signature.length) return false
    let diff = 0
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i)
    return diff === 0
  })
}
