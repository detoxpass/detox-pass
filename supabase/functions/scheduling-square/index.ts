import { appRole, json, preflight, requireUser, serviceClient, type SupabaseClient } from '../_shared/supabase.ts'
import {
  SQUARE_VERSION,
  availabilityTimes,
  durationMinutes,
  futureWindow,
  localDate,
  monthBounds,
  squareHost,
  zonedDayRange,
} from '../_shared/square.ts'

type Secret = {
  environment: 'sandbox' | 'production'
  accessToken: string
  locationId: string
  teamMemberId: string
  serviceVariationId: string
}

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
  token?: Partial<Secret>
  environment?: string
  access_token?: string
  location_id?: string
  team_member_id?: string
  service_variation_id?: string
}

type SquareChoice = {
  locations: { id: string; name: string; timezone: string }[]
  members: { id: string; name: string }[]
  services: { variationId: string; name: string; minutes: number }[]
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
  if (body.action === 'preview') return previewSquare(caller, body)
  if (body.action === 'connect') return connectSquare(caller, body)
  if (body.action === 'store_secret') return storeSecret(caller, body)
  if (body.action === 'availability') return availability(auth.client, body)
  if (body.action === 'dates') return dates(auth.client, body)
  if (body.action === 'book') return book(caller.id, body)
  if (body.action === 'reschedule') return reschedule(caller, body)
  if (body.action === 'cancel') return cancel(caller, body)
  if (body.action === 'read') return readBooking(caller, body)
  return json({ error: 'ação desconhecida' }, 400)
})

async function previewSquare(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error) return gate.error
  const found = await discover(body.environment, body.access_token)
  if (found.error) return found.error
  return json({ status: 'choose', ...found.choice, homologated: false })
}

async function connectSquare(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const found = await discover(body.environment, body.access_token)
  if (found.error || !found.choice || !found.secret) return found.error ?? json({ error: 'token Square inválido' }, 400)
  const location = pickOne(found.choice.locations, body.location_id, (row) => row.id)
  const member = pickOne(found.choice.members, body.team_member_id, (row) => row.id)
  const service = pickOne(found.choice.services, body.service_variation_id, (row) => row.variationId)
  if (!location || !member || !service) {
    return json({ status: 'choose', ...found.choice, homologated: false })
  }
  const secret: Secret = {
    ...found.secret,
    locationId: location.id,
    teamMemberId: member.id,
    serviceVariationId: service.variationId,
  }
  const admin = serviceClient()
  await admin.from('schedule_connections').update({ is_source: false }).eq('professional_id', gate.professionalId).neq('provider', 'square')
  const { data: existing } = await admin
    .from('schedule_connections')
    .select('id, status, external_resource_id')
    .eq('professional_id', gate.professionalId)
    .eq('provider', 'square')
    .maybeSingle()
  const status = existing?.status === 'tested' && existing.external_resource_id === service.variationId
    ? 'tested'
    : 'pending'
  let connectionId = existing?.id as string | undefined
  if (connectionId) {
    const { error } = await admin.from('schedule_connections').update({
      external_resource_id: service.variationId,
      is_source: true,
      status,
    }).eq('id', connectionId)
    if (error) return json({ error: error.message }, 400)
  } else {
    const { data, error } = await admin.from('schedule_connections').insert({
      professional_id: gate.professionalId,
      provider: 'square',
      external_resource_id: service.variationId,
      is_source: true,
      status: 'pending',
    }).select('id').single()
    if (error || !data) return json({ error: error?.message ?? 'não gravou a conexão' }, 400)
    connectionId = data.id
  }
  const { error: secretError } = await admin.rpc('store_calendar_secret', {
    p_connection_id: connectionId,
    p_token: JSON.stringify(secret),
  })
  if (secretError) return json({ error: secretError.message }, 400)
  const { error: modeError } = await admin.from('professionals').update({
    schedule_mode: 'external',
    schedule_prompt_dismissed: true,
  }).eq('id', gate.professionalId)
  if (modeError) return json({ error: modeError.message }, 400)
  return json({
    ok: true,
    provider: 'square',
    status,
    homologated: false,
    location: location,
    member,
    service,
  })
}

function squareFailure(status: number, payload: unknown) {
  if (status === 401) return json({ error: 'Square did not accept this access token.' }, 401)
  return json({ status: 'pending', supported: false, detail: payload }, status)
}

function pickOne<T>(rows: T[], id: string | undefined, read: (row: T) => string): T | null {
  if (rows.length === 1 && !id) return rows[0]
  if (!id) return null
  return rows.find((row) => read(row) === id) ?? null
}

async function ownProfessional(caller: Caller, requested?: string) {
  const admin = serviceClient()
  if (caller.role === 'operacao') {
    if (!requested) return { error: json({ error: 'professional_id obrigatório' }, 400) } as const
    const { data } = await admin.from('professionals').select('id').eq('id', requested).maybeSingle()
    if (!data) return { error: json({ error: 'profissional indisponível' }, 404) } as const
    return { professionalId: data.id as string } as const
  }
  const { data } = await admin.from('professionals').select('id').eq('profile_id', caller.id).maybeSingle()
  if (!data) return { error: json({ error: 'só a profissional conecta a própria agenda' }, 403) } as const
  if (requested && requested !== data.id) return { error: json({ error: 'só a profissional conecta a própria agenda' }, 403) } as const
  return { professionalId: data.id as string } as const
}

async function discover(environment: string | undefined, accessToken: string | undefined) {
  if (environment !== 'sandbox' && environment !== 'production') {
    return { error: json({ error: 'environment sandbox ou production' }, 400) } as const
  }
  if (!accessToken?.trim()) return { error: json({ error: 'access token obrigatório' }, 400) } as const
  const secret: Secret = {
    environment,
    accessToken: accessToken.trim(),
    locationId: 'discover',
    teamMemberId: 'discover',
    serviceVariationId: 'discover',
  }
  const [locationsResponse, membersResponse, services] = await Promise.all([
    square(secret, '/v2/locations'),
    square(secret, '/v2/team-members/search', {
      method: 'POST',
      body: JSON.stringify({ query: { filter: { status: 'ACTIVE' } }, limit: 25 }),
    }),
    listBookableServices(secret),
  ])
  const locationsBody = await locationsResponse.json().catch(() => null)
  const membersBody = await membersResponse.json().catch(() => null)
  if (!locationsResponse.ok) return { error: squareFailure(locationsResponse.status, locationsBody) } as const
  if (!membersResponse.ok) return { error: squareFailure(membersResponse.status, membersBody) } as const
  if (services.error) return { error: services.error } as const
  const locations = (Array.isArray(locationsBody?.locations) ? locationsBody.locations : []).flatMap((row: { id?: string; name?: string; timezone?: string; status?: string }) => {
    if (row.status && row.status !== 'ACTIVE') return []
    if (!row.id || !row.name || !row.timezone) return []
    return [{ id: row.id, name: row.name, timezone: row.timezone }]
  })
  const members = (Array.isArray(membersBody?.team_members) ? membersBody.team_members : []).flatMap((row: { id?: string; given_name?: string; family_name?: string; status?: string }) => {
    if (row.status && row.status !== 'ACTIVE') return []
    if (!row.id) return []
    const name = [row.given_name, row.family_name].filter(Boolean).join(' ') || 'Team member'
    return [{ id: row.id, name }]
  })
  const choice: SquareChoice = { locations, members, services: services.rows }
  if (locations.length === 0 || members.length === 0 || services.rows.length === 0) {
    return { error: json({ status: 'pending', supported: false, detail: 'Square não devolveu unidade, pessoa ou serviço de agenda', choice }, 422) } as const
  }
  return { choice, secret } as const
}

async function listBookableServices(secret: Secret) {
  const rows: SquareChoice['services'] = []
  let cursor = ''
  for (let page = 0; page < 5; page += 1) {
    const path = `/v2/catalog/list?types=${encodeURIComponent('ITEM')}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const response = await square(secret, path)
    const payload = await response.json().catch(() => null)
    if (!response.ok) return { error: squareFailure(response.status, payload) }
    const objects = Array.isArray(payload?.objects) ? payload.objects : []
    for (const object of objects) {
      const item = object?.item_data
      const variations = Array.isArray(item?.variations) ? item.variations : []
      for (const variation of variations) {
        const data = variation?.item_variation_data
        const minutes = durationMinutes(data?.service_duration)
        if (!variation?.id || minutes == null) continue
        const variant = typeof data?.name === 'string' && data.name !== 'Regular' ? ` · ${data.name}` : ''
        rows.push({ variationId: variation.id, name: `${item?.name ?? 'Service'}${variant} · ${minutes} min`, minutes })
      }
    }
    cursor = typeof payload?.cursor === 'string' ? payload.cursor : ''
    if (!cursor) break
  }
  return { rows }
}

async function storeSecret(caller: Caller, body: Body) {
  if (caller.role !== 'operacao') return json({ error: 'só a operação grava token de agenda' }, 403)
  const token = normalizeSecret(body.token)
  if (!body.connection_id || !token) {
    return json({ error: 'connection_id e token Square são obrigatórios' }, 400)
  }
  const { error } = await serviceClient().rpc('store_calendar_secret', {
    p_connection_id: body.connection_id,
    p_token: JSON.stringify(token),
  })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
}

async function availability(client: SupabaseClient, body: Body) {
  if (!body.professional_id) return json({ error: 'professional_id obrigatório' }, 400)
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: 'date YYYY-MM-DD obrigatória' }, 400)
  const ready = await readyFor(client, body.professional_id)
  if (ready.error) return ready.error
  const place = await locationTimezone(ready.secret)
  if (!place) return json({ status: 'pending', supported: false, detail: 'unidade Square sem fuso' }, 422)
  const range = zonedDayRange(body.date, place)
  if (!range) return json({ error: 'date inválida' }, 400)
  const listed = await searchAvailability(ready.secret, range.start, range.end)
  if (listed.error) return listed.error
  const times = listed.times.filter((time) => localDate(time, place) === body.date)
  return json({ times: times.map((time) => ({ time })), homologated: false })
}

async function dates(client: SupabaseClient, body: Body) {
  if (!body.professional_id) return json({ error: 'professional_id obrigatório' }, 400)
  const bounds = body.month ? monthBounds(body.month) : null
  if (!bounds) return json({ error: 'month YYYY-MM obrigatório' }, 400)
  const ready = await readyFor(client, body.professional_id)
  if (ready.error) return ready.error
  const place = await locationTimezone(ready.secret)
  if (!place) return json({ status: 'pending', supported: false, detail: 'unidade Square sem fuso' }, 422)
  const start = zonedDayRange(bounds.start, place)
  const end = zonedDayRange(bounds.end, place)
  if (!start || !end) return json({ error: 'month inválido' }, 400)
  const listed = await searchAvailability(ready.secret, start.start, end.start)
  if (listed.error) return listed.error
  const dates = [...new Set(listed.times.flatMap((time) => {
    const day = localDate(time, place)
    return day && day.startsWith(body.month ?? '') ? [day] : []
  }))].sort()
  return json({ dates, homologated: false })
}

async function book(clientId: string, body: Body) {
  if (!body.professional_id || !body.service_id || !body.city_id || !body.starts_at) {
    return json({ error: 'professional_id, service_id, city_id e starts_at são obrigatórios' }, 400)
  }
  const startsAt = body.starts_at
  const ready = await readyFor(serviceClient(), body.professional_id, true)
  if (ready.error) return ready.error
  const variation = await variationFacts(ready.secret)
  if (!variation) return json({ status: 'pending', supported: false, detail: 'variação Square sem versão ou duração' }, 422)
  const place = await locationTimezone(ready.secret)
  if (!place) return json({ status: 'pending', supported: false, detail: 'unidade Square sem fuso' }, 422)
  const day = localDate(startsAt, place)
  const range = day ? zonedDayRange(day, place) : null
  if (!range) return json({ status: 'pending', supported: false, detail: 'horário inválido' }, 422)
  const listed = await searchAvailability(ready.secret, range.start, range.end)
  if (listed.error) return listed.error
  if (!listed.times.some((time) => Date.parse(time) === Date.parse(startsAt))) {
    return json({ status: 'pending', supported: false, detail: 'horário não está mais disponível' }, 422)
  }

  const admin = serviceClient()
  const { data: bookingId, error: openError } = await admin.rpc('open_booking_intent', {
    p_client_id: clientId,
    p_professional_id: body.professional_id,
    p_service_id: body.service_id,
    p_city_id: body.city_id,
    p_starts_at: startsAt,
    p_provider: 'square',
    p_duration_minutes: variation.minutes,
  })
  if (openError || !bookingId) return json({ error: openError?.message ?? 'não abriu a intenção' }, 400)

  const account = await admin.auth.admin.getUserById(clientId)
  const email = account.data.user?.email
  if (!email) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ error: 'cliente sem e-mail' }, 422)
  }
  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', clientId).maybeSingle()
  const customerId = await customerFor(ready.secret, email, profile?.full_name ?? '')
  if (!customerId) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: 'cliente Square não abriu' }, 502)
  }

  const response = await square(ready.secret, '/v2/bookings', {
    method: 'POST',
    body: JSON.stringify({
      idempotency_key: bookingId,
      booking: {
        location_id: ready.secret.locationId,
        customer_id: customerId,
        start_at: new Date(startsAt).toISOString().replace('.000Z', 'Z'),
        appointment_segments: [{
          duration_minutes: variation.minutes,
          service_variation_id: ready.secret.serviceVariationId,
          service_variation_version: variation.version,
          team_member_id: ready.secret.teamMemberId,
        }],
      },
    }),
  })
  const payload = await response.json().catch(() => null)
  const externalId = payload?.booking?.id
  if (!response.ok || !externalId) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: payload }, 502)
  }

  const { error: markError } = await admin.rpc('mark_provider_confirmed', {
    p_booking_id: bookingId,
    p_external_booking_id: String(externalId),
  })
  if (markError) {
    const current = await square(ready.secret, `/v2/bookings/${externalId}`)
    const currentBody = await current.json().catch(() => null)
    const version = currentBody?.booking?.version
    const cancelResponse = version == null ? null : await square(ready.secret, `/v2/bookings/${externalId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ booking_version: version }),
    }).catch(() => null)
    if (cancelResponse?.ok) await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    else {
      await admin.rpc('mark_compensation_required', {
        p_booking_id: bookingId,
        p_detail: 'criação na Square não foi desfeita',
      })
    }
    return json({
      error: markError.message,
      booking_id: bookingId,
      status: cancelResponse?.ok ? 'cancelled' : 'compensation_required',
    }, 502)
  }
  return json({ booking_id: bookingId, external_booking_id: String(externalId), status: 'provider_confirmed', homologated: false })
}

async function reschedule(caller: Caller, body: Body) {
  if (!body.booking_id || !body.starts_at) return json({ error: 'booking_id e starts_at são obrigatórios' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await readyFor(serviceClient(), booking.professional_id, true)
  if (ready.error) return ready.error
  const current = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}`)
  const currentBody = await current.json().catch(() => null)
  const version = currentBody?.booking?.version
  if (!current.ok || version == null) return json({ status: 'pending', supported: false, detail: currentBody }, 502)

  const response = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}`, {
    method: 'PUT',
    body: JSON.stringify({ booking: { version, start_at: new Date(body.starts_at).toISOString().replace('.000Z', 'Z') } }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)

  const { error } = await serviceClient().rpc('mark_rescheduled', {
    p_booking_id: body.booking_id,
    p_starts_at: body.starts_at,
    p_origin: 'platform',
  })
  if (error) {
    const revert = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}`, {
      method: 'PUT',
      body: JSON.stringify({
        booking: { version: payload?.booking?.version, start_at: booking.starts_at },
      }),
    }).catch(() => null)
    if (!revert?.ok) {
      await serviceClient().rpc('mark_compensation_required', {
        p_booking_id: body.booking_id,
        p_detail: 'reagendamento na Square não voltou ao horário anterior',
      })
    }
    return json({ error: error.message, status: revert?.ok ? 'provider_confirmed' : 'compensation_required' }, 502)
  }
  return json({ ok: true, status: 'provider_confirmed', homologated: false })
}

async function cancel(caller: Caller, body: Body) {
  if (!body.booking_id) return json({ error: 'booking_id obrigatório' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await readyFor(serviceClient(), booking.professional_id, true)
  if (ready.error) return ready.error
  const current = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}`)
  const currentBody = await current.json().catch(() => null)
  const version = currentBody?.booking?.version
  if (!current.ok || version == null) return json({ status: 'pending', supported: false, detail: currentBody }, 502)

  const response = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ booking_version: version }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)

  let { error } = await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })
  if (error) error = (await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })).error
  if (error) {
    await serviceClient().rpc('mark_compensation_required', {
      p_booking_id: body.booking_id,
      p_detail: 'cancelamento na Square não gravou na plataforma',
    })
    return json({ error: error.message, status: 'compensation_required' }, 502)
  }
  return json({ ok: true, status: 'cancelled', homologated: false })
}

async function readBooking(caller: Caller, body: Body) {
  if (!body.booking_id) return json({ error: 'booking_id obrigatório' }, 400)
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await readyFor(serviceClient(), booking.professional_id, true)
  if (ready.error) return ready.error
  const response = await square(ready.secret, `/v2/bookings/${booking.external_booking_id}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok) return json({ status: 'pending', supported: false, detail: payload }, response.status)
  const external = payload?.booking
  const externalStarts = typeof external?.start_at === 'string' ? external.start_at : null
  const canceled = typeof external?.status === 'string' && external.status.startsWith('CANCELLED')
  return json({
    supported: true,
    homologated: false,
    local_status: booking.saga_status,
    local_starts_at: booking.starts_at,
    external_starts_at: externalStarts,
    external_canceled: canceled,
    diverged: canceled
      ? booking.saga_status !== 'cancelled'
      : typeof externalStarts === 'string' && Date.parse(externalStarts) !== Date.parse(booking.starts_at),
  })
}

async function readyFor(client: SupabaseClient, professionalId: string, skipVisibility = false) {
  if (!skipVisibility) {
    const { data: visible } = await client
      .from('professionals')
      .select('id, schedule_mode')
      .eq('id', professionalId)
      .eq('active', true)
      .maybeSingle()
    if (!visible) return { error: json({ error: 'profissional indisponível' }, 404) } as const
    if (visible.schedule_mode !== 'external') {
      return { error: json({ status: 'pending', supported: false, detail: 'profissional sem agenda externa' }, 422) } as const
    }
  }
  const { data: connection } = await serviceClient()
    .from('schedule_connections')
    .select('id, external_resource_id')
    .eq('professional_id', professionalId)
    .eq('provider', 'square')
    .maybeSingle()
  if (!connection) return { error: json({ status: 'pending', supported: false, detail: 'profissional sem agenda Square' }, 422) } as const
  const secret = await readSecret(connection.id, connection.external_resource_id)
  if (!secret) return { error: json({ status: 'pending', supported: false, detail: 'token Square ainda não gravado' }, 422) } as const
  return { secret } as const
}

function denyUnlessParty(caller: Caller, booking: { client_id: string } | null) {
  const allowed = caller.role === 'operacao' || (caller.role === 'cliente' && booking?.client_id === caller.id)
  if (!booking || !allowed) return json({ error: 'reserva indisponível' }, 403)
  return null
}

async function loadBooking(bookingId: string) {
  const { data } = await serviceClient()
    .from('bookings')
    .select('id, professional_id, external_booking_id, client_id, starts_at, saga_status, provider')
    .eq('id', bookingId)
    .eq('provider', 'square')
    .maybeSingle()
  return data
}

async function searchAvailability(secret: Secret, start: string, end: string) {
  const window = futureWindow(start, end)
  if (!window) return { times: [] as string[] }
  const response = await square(secret, '/v2/bookings/availability/search', {
    method: 'POST',
    body: JSON.stringify({
      query: {
        filter: {
          start_at_range: { start_at: window.start, end_at: window.end },
          location_id: secret.locationId,
          segment_filters: [{
            service_variation_id: secret.serviceVariationId,
            team_member_id_filter: { any: [secret.teamMemberId] },
          }],
        },
      },
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return { error: json({ status: 'pending', supported: false, homologated: false, detail: payload }, response.status) }
  return { times: availabilityTimes(payload) }
}

async function locationTimezone(secret: Secret) {
  const response = await square(secret, `/v2/locations/${secret.locationId}`)
  const payload = await response.json().catch(() => null)
  const timezone = payload?.location?.timezone
  return response.ok && typeof timezone === 'string' && timezone ? timezone : null
}

async function variationFacts(secret: Secret) {
  const response = await square(secret, `/v2/catalog/object/${secret.serviceVariationId}`)
  const payload = await response.json().catch(() => null)
  const object = payload?.object
  if (!response.ok || !object) return null
  const version = typeof object.version === 'number' ? object.version : null
  const minutes = durationMinutes(object.item_variation_data?.service_duration)
  if (version == null || minutes == null) return null
  return { version, minutes }
}

async function customerFor(secret: Secret, email: string, fullName: string) {
  const found = await square(secret, '/v2/customers/search', {
    method: 'POST',
    body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } }),
  })
  const foundBody = await found.json().catch(() => null)
  const existing = foundBody?.customers?.[0]?.id
  if (found.ok && typeof existing === 'string') return existing
  const [given, ...rest] = (fullName.trim() || 'Cliente Detox').split(' ')
  const created = await square(secret, '/v2/customers', {
    method: 'POST',
    body: JSON.stringify({
      given_name: given || 'Cliente',
      family_name: rest.join(' ') || 'Detox',
      email_address: email,
    }),
  })
  const createdBody = await created.json().catch(() => null)
  return created.ok && typeof createdBody?.customer?.id === 'string' ? createdBody.customer.id : null
}

function normalizeSecret(value: Partial<Secret> | undefined): Secret | null {
  if (!value?.accessToken || !value.locationId || !value.teamMemberId || !value.serviceVariationId) return null
  if (value.environment !== 'sandbox' && value.environment !== 'production') return null
  return {
    environment: value.environment,
    accessToken: value.accessToken,
    locationId: value.locationId,
    teamMemberId: value.teamMemberId,
    serviceVariationId: value.serviceVariationId,
  }
}

async function readSecret(connectionId: string, resourceId: string | null): Promise<Secret | null> {
  const { data, error } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: connectionId })
  if (error || !data) return null
  try {
    const parsed = JSON.parse(data) as Partial<Secret>
    const secret = normalizeSecret({
      ...parsed,
      serviceVariationId: parsed.serviceVariationId || resourceId || undefined,
    })
    return secret
  } catch {
    return null
  }
}

function square(secret: Secret, path: string, init: RequestInit = {}) {
  const host = squareHost(secret.environment)
  if (!host) return Promise.resolve(new Response(JSON.stringify({ error: 'ambiente Square desconhecido' }), { status: 422 }))
  return fetch(`${host}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret.accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'Square-Version': SQUARE_VERSION,
      ...(init.headers ?? {}),
    },
  })
}
