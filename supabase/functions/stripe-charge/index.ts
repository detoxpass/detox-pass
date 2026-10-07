import { json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'

type Body = {
  booking_id?: string
  success_url?: string
  cancel_url?: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY ausente neste ambiente' }, 503)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  if (!body.booking_id || !body.success_url || !body.cancel_url) {
    return json({ error: 'booking_id, success_url e cancel_url são obrigatórios' }, 400)
  }

  if (!stripeKey.startsWith('sk_test_')) {
    return json({ error: 'esta POC só aceita chave de teste da Stripe' }, 503)
  }

  if (!returnUrl(body.success_url, body.booking_id) || !returnUrl(body.cancel_url, body.booking_id)) {
    return json({ error: 'success_url e cancel_url precisam voltar para a sessão neste app' }, 400)
  }

  const { data: booking, error: bookingError } = await auth.client
    .from('bookings')
    .select('id, saga_status, client_id, professional_id, service_id')
    .eq('id', body.booking_id)
    .maybeSingle()
  if (bookingError) return json({ error: bookingError.message }, 400)
  const ready = booking?.saga_status === 'provider_confirmed' || booking?.saga_status === 'charge_created'
  if (!booking || booking.client_id !== auth.user.id || !ready) {
    return json({ error: 'reserva não está pronta para cobrança desta cliente' }, 403)
  }

  const { data: service, error: serviceError } = await auth.client
    .from('services')
    .select('name, price_cents, currency')
    .eq('id', booking.service_id)
    .maybeSingle()
  if (serviceError) return json({ error: serviceError.message }, 400)
  if (!service?.price_cents || !service.currency) {
    return json({ error: 'serviço sem preço configurado pela operação' }, 422)
  }

  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('payment_method_types[0]', 'card')
  form.set('success_url', body.success_url)
  form.set('cancel_url', body.cancel_url)
  form.set('client_reference_id', body.booking_id)
  form.set('metadata[booking_id]', booking.id)
  form.set('metadata[client_id]', booking.client_id)
  form.set('metadata[professional_id]', booking.professional_id)
  form.set('line_items[0][quantity]', '1')
  form.set('line_items[0][price_data][currency]', service.currency.toLowerCase())
  form.set('line_items[0][price_data][unit_amount]', String(service.price_cents))
  form.set('line_items[0][price_data][product_data][name]', service.name || 'Detox Pass')

  const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const session = await stripe.json()
  if (!stripe.ok || !session.id) return json({ error: session.error?.message ?? 'Stripe recusou a sessão' }, 502)

  const { error } = await serviceClient().rpc('mark_charge_created', {
    p_booking_id: body.booking_id,
    p_external_charge_ref: session.id,
    p_amount_cents: service.price_cents,
    p_currency: service.currency,
  })
  if (error) {
    return json({
      error: error.message,
      stripe_session_id: session.id,
      detail: 'A sessão Stripe existe e o banco não gravou a cobrança. Compensar antes de cobrar de novo.',
    }, 500)
  }

  return json({ booking_id: body.booking_id, checkout_url: session.url, stripe_session_id: session.id })
})

const returnOrigins = new Set([
  'https://detox-pass.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

function returnUrl(value: string, bookingId: string): boolean {
  try {
    const url = new URL(value)
    return returnOrigins.has(url.origin) && url.pathname === `/sessions/${bookingId}`
  } catch {
    return false
  }
}
