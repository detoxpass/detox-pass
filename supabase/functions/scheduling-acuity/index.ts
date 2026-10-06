import { datesToQuery, slotIsOpen } from '../_shared/slot.ts'
import { appRole, json, preflight, requireUser, serviceClient, type SupabaseClient } from '../_shared/supabase.ts'

const ACUITY = 'https://acuityscheduling.com/api/v1'

type Secret = { userId?: string; apiKey?: string }
type Body = {
  action?: string
  professional_id?: string
  service_id?: string
  city_id?: string
  starts_at?: string
  date?: string
  month?: string
  booking_id?: string
  connection_id?: string
  token?: Secret
}

type Caller = { id: string; role: string }

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
  if (body.action === 'store_secret') return storeSecret(caller, body)
  if (body.action === 'availability') return availability(auth.client, body)
  if (body.action === 'dates') return dates(auth.client, body)
  if (body.action === 'book') return book(caller.id, body)
  if (body.action === 'reschedule') return reschedule(caller, body)
  if (body.action === 'cancel') return cancel(caller, body)
  if (body.action === 'read') return readBooking(caller, body)
  return json({ error: 'ação desconhecida' }, 400)
})

async function storeSecret(caller: Caller, body: Body) {
  if (caller.role !== 'operacao') return json({ error: 'só a operação grava token de agenda' }, 403)
  if (!body.connection_id || !body.token?.userId || !body.token?.apiKey) {
    return json({ error: 'connection_id e token { userId, apiKey } são obrigatórios' }, 400)
  }
  const { error } = await serviceClient().rpc('store_calendar_secret', {
    p_connection_id: body.connection_id,
    p_token: JSON.stringify({ userId: body.token.userId, apiKey: body.token.apiKey }),
  })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
}

async function availability(client: SupabaseClient, body: Body) {
  if (!body.professional_id) return json({ error: 'professional_id obrigatório' }, 400)
  const { data: visible } = await client
    .from('professionals')
    .select('id')
    .eq('id', body.professional_id)
    .eq('active', true)
    .maybeSingle()
  if (!visible) return json({ error: 'profissional indisponível' }, 404)

  const conn = await connectionForProfessional(body.professional_id)
  if (!conn) return json({ status: 'pending', supported: false, detail: 'profissional sem agenda Acuity' }, 422)
  const secret = await readSecret(conn.id)
  if (!secret) return json({ status: 'pending', supported: false, detail: 'token Acuity ainda não gravado' }, 422)
  if (!body.date) return json({ error: 'date YYYY-MM-DD obrigatória' }, 400)

  const typeId = appointmentTypeId(conn.external_resource_id)
  if (typeId === null) {
    return json({ status: 'pending', supported: false, detail: 'appointment type precisa ser numérico' }, 422)
  }

  const url = new URL(`${ACUITY}/availability/times`)
  url.searchParams.set('date', body.date)
  url.searchParams.set('appointmentTypeID', String(typeId))
  const response = await acuity(secret, url)
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, homologated: false, detail: payload }, response.status)
  return json({ times: payload, homologated: false })
}

async function dates(client: SupabaseClient, body: Body) {
  if (!body.professional_id) return json({ error: 'professional_id obrigatório' }, 400)
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) return json({ error: 'month YYYY-MM obrigatório' }, 400)
  const { data: visible } = await client
    .from('professionals')
    .select('id')
    .eq('id', body.professional_id)
    .eq('active', true)
    .maybeSingle()
  if (!visible) return json({ error: 'profissional indisponível' }, 404)

  const ready = await acuityReady(body.professional_id)
  if (ready.error) return ready.error
  const url = new URL(`${ACUITY}/availability/dates`)
  url.searchParams.set('month', body.month)
  url.searchParams.set('appointmentTypeID', String(ready.typeId))
  const response = await acuity(ready.secret, url)
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, homologated: false, detail: payload }, response.status)
  const rows = Array.isArray(payload) ? payload : []
  const dates = rows.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (item && typeof item === 'object' && typeof (item as { date?: unknown }).date === 'string') {
      return [(item as { date: string }).date]
    }
    return []
  })
  return json({ dates, homologated: false })
}

async function book(clientId: string, body: Body) {
  if (!body.professional_id || !body.service_id || !body.city_id || !body.starts_at) {
    return json({ error: 'professional_id, service_id, city_id e starts_at são obrigatórios' }, 400)
  }
  const admin = serviceClient()
  const { data: bookingId, error: openError } = await admin.rpc('open_booking_intent', {
    p_client_id: clientId,
    p_professional_id: body.professional_id,
    p_service_id: body.service_id,
    p_city_id: body.city_id,
    p_starts_at: body.starts_at,
    p_provider: 'acuity',
  })
  if (openError || !bookingId) return json({ error: openError?.message ?? 'não abriu a intenção' }, 400)

  const ready = await acuityReady(body.professional_id)
  if (ready.error) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: 'agenda Acuity sem credencial ou appointment type numérico' }, 422)
  }
  const { secret, typeId } = ready

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', clientId).maybeSingle()
  const fullName = profile?.full_name?.trim() || 'Cliente Detox'
  const [firstName, ...rest] = fullName.split(' ')
  const account = await admin.auth.admin.getUserById(clientId)
  const email = account.data.user?.email
  if (!email) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ error: 'cliente sem e-mail' }, 422)
  }

  const closed = await ensureSlotOpen(secret, typeId, body.starts_at)
  if (closed) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return closed
  }

  const response = await acuity(secret, new URL(`${ACUITY}/appointments`), {
    method: 'POST',
    body: JSON.stringify({
      datetime: body.starts_at,
      appointmentTypeID: typeId,
      firstName: firstName || 'Cliente',
      lastName: rest.join(' ') || 'Detox',
      email,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.id) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: payload }, 502)
  }

  const { error: markError } = await admin.rpc('mark_provider_confirmed', {
    p_booking_id: bookingId,
    p_external_booking_id: String(payload.id),
  })
  if (markError) {
    const cancelResponse = await acuity(
      secret,
      new URL(`${ACUITY}/appointments/${payload.id}/cancel`),
      { method: 'PUT' },
    ).catch(() => null)
    if (cancelResponse?.ok) {
      await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    } else {
      await admin.rpc('mark_compensation_required', {
        p_booking_id: bookingId,
        p_detail: 'criação na Acuity não foi desfeita',
      })
    }
    return json({
      error: markError.message,
      booking_id: bookingId,
      status: cancelResponse?.ok ? 'cancelled' : 'compensation_required',
      external_cancel: cancelResponse?.ok ? 'requested' : 'failed',
    }, 502)
  }
  return json({ booking_id: bookingId, external_booking_id: String(payload.id), status: 'provider_confirmed' })
}

async function reschedule(caller: Caller, body: Body) {
  if (!body.booking_id || !body.starts_at) return json({ error: 'booking_id e starts_at são obrigatórios' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await acuityReady(booking.professional_id)
  if (ready.error) return ready.error
  const closed = await ensureSlotOpen(ready.secret, ready.typeId, body.starts_at)
  if (closed) return closed

  const response = await acuity(ready.secret, new URL(`${ACUITY}/appointments/${booking.external_booking_id}/reschedule`), {
    method: 'PUT',
    body: JSON.stringify({ datetime: body.starts_at }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)

  const { error } = await serviceClient().rpc('mark_rescheduled', {
    p_booking_id: body.booking_id,
    p_starts_at: body.starts_at,
    p_origin: 'platform',
  })
  if (error) {
    const revert = booking.starts_at
      ? await acuity(ready.secret, new URL(`${ACUITY}/appointments/${booking.external_booking_id}/reschedule`), {
        method: 'PUT',
        body: JSON.stringify({ datetime: booking.starts_at }),
      }).catch(() => null)
      : null
    if (!revert?.ok) {
      await serviceClient().rpc('mark_compensation_required', {
        p_booking_id: body.booking_id,
        p_detail: 'reagendamento na Acuity não voltou ao horário anterior',
      })
    }
    return json({
      error: error.message,
      status: revert?.ok ? 'provider_confirmed' : 'compensation_required',
    }, 502)
  }
  return json({ ok: true, status: 'provider_confirmed' })
}

async function cancel(caller: Caller, body: Body) {
  if (!body.booking_id) return json({ error: 'booking_id obrigatório' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await acuityReady(booking.professional_id)
  if (ready.error) return ready.error

  const response = await acuity(ready.secret, new URL(`${ACUITY}/appointments/${booking.external_booking_id}/cancel`), {
    method: 'PUT',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)

  let { error } = await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })
  if (error) {
    const retry = await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })
    error = retry.error
  }
  if (error) {
    await serviceClient().rpc('mark_compensation_required', {
      p_booking_id: body.booking_id,
      p_detail: 'cancelamento na Acuity não gravou na plataforma',
    })
    return json({ error: error.message, status: 'compensation_required' }, 502)
  }
  return json({ ok: true, status: 'cancelled' })
}

async function connectionForProfessional(professionalId?: string) {
  if (!professionalId) return null
  const { data } = await serviceClient()
    .from('schedule_connections')
    .select('id, external_resource_id, provider')
    .eq('professional_id', professionalId)
    .eq('provider', 'acuity')
    .maybeSingle()
  return data
}

function denyUnlessParty(
  caller: Caller,
  booking: { client_id: string } | null,
): Response | null {
  const allowed = caller.role === 'operacao' || (caller.role === 'cliente' && booking?.client_id === caller.id)
  if (!booking || !allowed) return json({ error: 'reserva indisponível' }, 403)
  return null
}

async function ensureSlotOpen(secret: Secret, typeId: number, startsAt: string): Promise<Response | null> {
  const payloads: unknown[] = []
  for (const date of datesToQuery(startsAt)) {
    const url = new URL(`${ACUITY}/availability/times`)
    url.searchParams.set('date', date)
    url.searchParams.set('appointmentTypeID', String(typeId))
    const response = await acuity(secret, url)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return json({ status: 'pending', supported: false, detail: payload ?? 'falha ao revalidar o horário' }, 502)
    }
    payloads.push(payload)
  }
  if (!slotIsOpen(payloads, startsAt)) {
    return json({ status: 'pending', supported: false, detail: 'horário não está mais disponível' }, 422)
  }
  return null
}

function appointmentTypeId(value?: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null
  return parsed
}

async function loadBooking(bookingId: string) {
  const { data } = await serviceClient()
    .from('bookings')
    .select('id, professional_id, external_booking_id, client_id, starts_at, saga_status')
    .eq('id', bookingId)
    .maybeSingle()
  return data
}

async function acuityReady(professionalId: string): Promise<
  { secret: Secret; typeId: number; connectionId: string; error?: undefined } | { error: Response; secret?: undefined; typeId?: undefined; connectionId?: undefined }
> {
  const conn = await connectionForProfessional(professionalId)
  const secret = conn ? await readSecret(conn.id) : null
  const typeId = appointmentTypeId(conn?.external_resource_id)
  if (!conn || !secret || typeId === null) {
    return {
      error: json({ status: 'pending', supported: false, detail: 'token ou appointment type numérico ausente' }, 422),
    }
  }
  return { secret, typeId, connectionId: conn.id }
}

async function readBooking(caller: Caller, body: Body) {
  if (!body.booking_id) return json({ error: 'booking_id obrigatório' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await acuityReady(booking.professional_id)
  if (ready.error) return ready.error
  const response = await acuity(ready.secret, new URL(`${ACUITY}/appointments/${booking.external_booking_id}`))
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)
  const externalStarts = payload && typeof payload === 'object' ? (payload as { datetime?: unknown }).datetime : null
  const canceled = Boolean(payload && typeof payload === 'object' && (payload as { canceled?: unknown }).canceled)
  return json({
    supported: true,
    homologated: false,
    local_status: booking.saga_status,
    local_starts_at: booking.starts_at,
    external_starts_at: typeof externalStarts === 'string' ? externalStarts : null,
    external_canceled: canceled,
    diverged: canceled
      ? booking.saga_status !== 'cancelled'
      : typeof externalStarts === 'string' && Date.parse(externalStarts) !== Date.parse(booking.starts_at),
  })
}

async function readSecret(connectionId: string): Promise<Secret | null> {
  const { data, error } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: connectionId })
  if (error || !data) return null
  try {
    const parsed = JSON.parse(data) as Secret
    if (!parsed.userId || !parsed.apiKey) return null
    return parsed
  } catch {
    return null
  }
}

function acuity(secret: Secret, url: URL, init: RequestInit = {}) {
  const token = btoa(`${secret.userId}:${secret.apiKey}`)
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Basic ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}
