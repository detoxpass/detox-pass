import { appRole, json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'

type Body = {
  action?: string
  professional_id?: string
  service_id?: string
  city_id?: string
  starts_at?: string
  date?: string
  month?: string
  booking_id?: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  const caller = { id: auth.user.id, role: appRole(auth.user) }
  if (body.action === 'dates') return dates(body)
  if (body.action === 'availability') return availability(body)
  if (body.action === 'book') return book(caller, body)
  if (body.action === 'reschedule') return reschedule(caller, body)
  if (body.action === 'cancel') return cancel(caller, body)
  if (body.action === 'read') return readBooking(caller, body)
  return json({ error: 'ação desconhecida' }, 400)
})

async function dates(body: Body) {
  if (!body.professional_id || !body.month) return json({ error: 'professional_id e month são obrigatórios' }, 400)
  const { data, error } = await serviceClient().rpc('internal_dates', {
    p_professional_id: body.professional_id,
    p_month: body.month,
  })
  if (error) return json({ error: error.message }, 400)
  const rows = Array.isArray(data) ? data : []
  return json({
    dates: rows.map((item) => typeof item === 'string' ? item.slice(0, 10) : String(item).slice(0, 10)),
    source: 'internal',
  })
}

async function availability(body: Body) {
  if (!body.professional_id || !body.date) return json({ error: 'professional_id e date são obrigatórios' }, 400)
  const { data, error } = await serviceClient().rpc('internal_openings', {
    p_professional_id: body.professional_id,
    p_day: body.date,
  })
  if (error) return json({ error: error.message }, 400)
  const times = (Array.isArray(data) ? data : []).flatMap((item) => {
    if (item && typeof item === 'object' && 'starts_at' in item && typeof item.starts_at === 'string') {
      return [{ time: item.starts_at }]
    }
    return []
  })
  return json({ times, source: 'internal' })
}

async function book(caller: { id: string; role: string }, body: Body) {
  if (caller.role !== 'cliente') return json({ error: 'só a cliente reserva' }, 403)
  if (!body.professional_id || !body.service_id || !body.city_id || !body.starts_at) {
    return json({ error: 'professional_id, service_id, city_id e starts_at são obrigatórios' }, 400)
  }
  const admin = serviceClient()
  const { data: bookingId, error: openError } = await admin.rpc('open_booking_intent', {
    p_client_id: caller.id,
    p_professional_id: body.professional_id,
    p_service_id: body.service_id,
    p_city_id: body.city_id,
    p_starts_at: body.starts_at,
  })
  if (openError || !bookingId) {
    const message = openError?.message ?? 'não abriu a intenção'
    const status = message.includes('já tem reserva') ? 409 : 422
    return json({ status: 'pending', detail: message }, status)
  }

  const { error: markError } = await admin.rpc('mark_provider_confirmed', {
    p_booking_id: bookingId,
    p_external_booking_id: `internal:${bookingId}`,
  })
  if (markError) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ error: markError.message, booking_id: bookingId, status: 'cancelled' }, 502)
  }
  return json({ booking_id: bookingId, external_booking_id: `internal:${bookingId}`, status: 'provider_confirmed' })
}

async function loadBooking(id?: string) {
  if (!id) return null
  const { data } = await serviceClient()
    .from('bookings')
    .select('id, client_id, professional_id, provider, external_booking_id, saga_status, starts_at')
    .eq('id', id)
    .maybeSingle()
  return data
}

function denyUnlessParty(caller: { id: string; role: string }, booking: { client_id: string } | null) {
  const allowed = caller.role === 'operacao' || (caller.role === 'cliente' && booking?.client_id === caller.id)
  if (!booking || !allowed) return json({ error: 'reserva indisponível' }, 403)
  return null
}

async function reschedule(caller: { id: string; role: string }, body: Body) {
  if (!body.booking_id || !body.starts_at) return json({ error: 'booking_id e starts_at são obrigatórios' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (booking?.provider !== 'internal') return json({ error: 'reserva não é da agenda interna' }, 422)
  const { error } = await serviceClient().rpc('mark_rescheduled', {
    p_booking_id: body.booking_id,
    p_starts_at: body.starts_at,
    p_origin: 'platform',
  })
  if (error) {
    const status = error.message.includes('já tem reserva') ? 409 : 422
    return json({ error: error.message, status: 'provider_confirmed' }, status)
  }
  return json({ status: 'provider_confirmed', booking_id: body.booking_id })
}

async function cancel(caller: { id: string; role: string }, body: Body) {
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (booking?.provider !== 'internal') return json({ error: 'reserva não é da agenda interna' }, 422)
  const { error } = await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true, status: 'cancelled' })
}

async function readBooking(caller: { id: string; role: string }, body: Body) {
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (booking?.provider !== 'internal') return json({ status: 'pending', supported: false, detail: 'reserva externa' }, 422)
  return json({
    source: 'internal',
    diverged: false,
    external_starts_at: booking.starts_at,
    external_canceled: booking.saga_status === 'cancelled',
  })
}
