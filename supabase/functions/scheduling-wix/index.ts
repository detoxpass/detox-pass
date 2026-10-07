import { appRole, json, preflight, requireUser, serviceClient, type SupabaseClient } from '../_shared/supabase.ts'
import {
  appointmentChoices,
  confirmsWithoutWixCart,
  durationMinutes,
  localWall,
  normalizePem,
  signWixState,
  slotsFromPayload,
  wallTimeToUtc,
  wixInstallUrl,
  type WixServiceChoice,
  type WixSlot,
} from '../_shared/wix.ts'

type Stored = {
  appId?: string
  appSecret?: string
  instanceId?: string
  publicKeyPem?: string
  revoked?: boolean
}

type Secret = {
  appId: string
  appSecret: string
  instanceId: string
  publicKeyPem: string
  serviceId: string
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
  wix_service_id?: string
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
  if (body.action === 'oauth_start') return oauthStart(caller, body)
  if (body.action === 'options') return options(caller, body)
  if (body.action === 'finish') return finish(caller, body)
  if (body.action === 'disconnect') return disconnect(caller, body)
  if (body.action === 'status') return status(caller, body)
  if (body.action === 'availability') return availability(auth.client, body)
  if (body.action === 'dates') return dates(auth.client, body)
  if (body.action === 'book') return book(caller, body)
  if (body.action === 'reschedule') return reschedule(caller, body)
  if (body.action === 'cancel') return cancel(caller, body)
  if (body.action === 'read') return readBooking(caller, body)
  return json({ error: 'ação desconhecida' }, 400)
})

async function oauthStart(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const app = await appCredentials()
  const stateSecret = Deno.env.get('WIX_OAUTH_STATE_SECRET')?.trim() ?? ''
  if (!app || !stateSecret) return json({ error: 'Wix sign-in is not configured yet.' }, 503)
  const state = await signWixState(stateSecret, {
    professionalId: gate.professionalId,
    surface: caller.role === 'operacao' ? 'admin' : 'agenda',
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    nonce: crypto.randomUUID(),
  })
  const url = wixInstallUrl(app.appId, state, Deno.env.get('WIX_SHARE_URL_ID')?.trim() ?? '')
  if (!url) return json({ error: 'Wix sign-in is not configured yet.' }, 503)
  return json({ url, homologated: false })
}

async function options(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const account = await accountSecret(gate.professionalId)
  if (account.error || !account.stored) return account.error ?? json({ error: 'Connect with Wix before choosing a service.' }, 422)
  const listed = await listServices(account.stored)
  if (listed.error) return listed.error
  return json({ status: 'choose', services: listed.services.map(publicService), homologated: false })
}

async function finish(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const account = await accountSecret(gate.professionalId)
  if (account.error || !account.stored || !account.connectionId) {
    return account.error ?? json({ error: 'Connect with Wix before choosing a service.' }, 422)
  }
  const listed = await listServices(account.stored)
  if (listed.error) return listed.error
  const service = pickService(listed.services, body.wix_service_id)
  if (!service) return json({ status: 'choose', services: listed.services.map(publicService), homologated: false })
  const saved = await saveService(gate.professionalId, account.connectionId, account.stored, service.id)
  if (saved.error) return saved.error
  return json({ ok: true, provider: 'wix', status: saved.status, service: publicService(service), homologated: false })
}

async function disconnect(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const admin = serviceClient()
  const { data: connection } = await admin
    .from('schedule_connections')
    .select('id, is_source')
    .eq('professional_id', gate.professionalId)
    .eq('provider', 'wix')
    .maybeSingle()
  if (!connection) return json({ ok: true, homologated: false })
  const stored = await readStored(connection.id)
  const kept = {
    appId: stored?.appId,
    appSecret: stored?.appSecret,
    publicKeyPem: stored?.publicKeyPem,
    revoked: true,
  }
  const { error } = await admin.rpc('store_calendar_secret', {
    p_connection_id: connection.id,
    p_token: JSON.stringify(kept),
  })
  if (error) return json({ error: error.message }, 400)
  await admin.from('schedule_connections').update({
    external_resource_id: null,
    is_source: false,
    status: 'pending',
  }).eq('id', connection.id)
  if (connection.is_source) {
    await admin.from('professionals').update({ schedule_mode: null }).eq('id', gate.professionalId).eq('schedule_mode', 'external')
  }
  return json({ ok: true, homologated: false })
}

async function status(caller: Caller, body: Body) {
  const gate = await ownProfessional(caller, body.professional_id)
  if (gate.error || !gate.professionalId) return gate.error ?? json({ error: 'profissional obrigatória' }, 400)
  const { data: connection } = await serviceClient()
    .from('schedule_connections')
    .select('id, status, external_resource_id, is_source')
    .eq('professional_id', gate.professionalId)
    .eq('provider', 'wix')
    .maybeSingle()
  const stored = connection ? await readStored(connection.id) : null
  const instance = Boolean(stored?.instanceId) && stored?.revoked !== true
  return json({
    connected: connection?.status === 'tested' || connection?.status === 'homologated',
    pendingChoice: instance && !connection?.external_resource_id,
    saved: Boolean(connection?.external_resource_id) && instance,
    status: connection?.status ?? null,
    isSource: Boolean(connection?.is_source),
    homologated: false,
  })
}

async function availability(client: SupabaseClient, body: Body) {
  if (!body.professional_id) return json({ error: 'professional_id obrigatório' }, 400)
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: 'date YYYY-MM-DD obrigatória' }, 400)
  const date = body.date
  const ready = await readyFor(client, body.professional_id)
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const opened = await openSlots(ready.secret, `${date}T00:00:00`, nextDay(date))
  if (opened.error) return opened.error
  const times = opened.slots.filter((slot) => slot.start.startsWith(date) && Date.parse(slot.time) > Date.now())
  return json({ times: times.map((slot) => ({ time: slot.time })), homologated: false })
}

async function dates(client: SupabaseClient, body: Body) {
  if (!body.professional_id || !body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return json({ error: 'professional_id e month YYYY-MM são obrigatórios' }, 400)
  }
  const month = Number(body.month.slice(5))
  if (month < 1 || month > 12) return json({ error: 'month inválido' }, 400)
  const ready = await readyFor(client, body.professional_id)
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const opened = await openSlots(ready.secret, `${body.month}-01T00:00:00`, nextMonth(body.month))
  if (opened.error) return opened.error
  const days = [...new Set(opened.slots.flatMap((slot) => slot.start.startsWith(body.month ?? '') ? [slot.start.slice(0, 10)] : []))].sort()
  return json({ dates: days, homologated: false })
}

async function book(caller: Caller, body: Body) {
  if (caller.role !== 'cliente') return json({ error: 'só a cliente reserva' }, 403)
  if (!body.professional_id || !body.service_id || !body.city_id || !body.starts_at) {
    return json({ error: 'professional_id, service_id, city_id e starts_at são obrigatórios' }, 400)
  }
  const startsAt = body.starts_at
  const ready = await readyFor(serviceClient(), body.professional_id, true)
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const place = await timeZoneOf(ready.secret)
  if (!place) return json({ status: 'pending', supported: false, detail: 'Wix site has no time zone.' }, 422)
  const day = localWall(startsAt, place)?.slice(0, 10)
  if (!day) return json({ status: 'pending', supported: false, detail: 'Invalid time.' }, 422)
  const opened = await openSlots(ready.secret, `${day}T00:00:00`, nextDay(day))
  if (opened.error) return opened.error
  const slot = opened.slots.find((item) => Date.parse(item.time) === Date.parse(startsAt))
  if (!slot) return json({ status: 'pending', supported: false, detail: 'That time is no longer available.' }, 422)
  const service = opened.service
  const minutes = durationMinutes(slot.time, slot.end, place)
  if (!minutes) return json({ status: 'pending', supported: false, detail: 'Wix service length is missing.' }, 422)

  const admin = serviceClient()
  const { data: bookingId, error: openError } = await admin.rpc('open_booking_intent', {
    p_client_id: caller.id,
    p_professional_id: body.professional_id,
    p_service_id: body.service_id,
    p_city_id: body.city_id,
    p_starts_at: startsAt,
    p_provider: 'wix',
    p_duration_minutes: minutes,
  })
  if (openError || !bookingId) return json({ error: openError?.message ?? 'não abriu a intenção' }, 400)

  const account = await admin.auth.admin.getUserById(caller.id)
  const email = account.data.user?.email
  if (!email) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ error: 'cliente sem e-mail' }, 422)
  }
  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', caller.id).maybeSingle()
  const created = await createBooking(ready.secret, {
    service,
    slot,
    timeZone: place,
    email,
    fullName: profile?.full_name ?? '',
  })
  if (!created.id) {
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: created.error }, 502)
  }

  let externalId = created.id
  let confirmed = created.status === 'CONFIRMED'
  if (!confirmed) {
    if (!confirmsWithoutWixCart(service)) {
      await cancelExternal(ready.secret, externalId, created.revision)
      await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
      return json({
        status: 'pending',
        booking_id: bookingId,
        detail: 'This Wix service asks for payment on Wix. Detox Pass does not take that payment here.',
      }, 422)
    }
    const confirm = await confirmBooking(ready.secret, externalId, created.revision)
    if (!confirm.ok) {
      await cancelExternal(ready.secret, externalId, created.revision)
      await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
      return json({ status: 'pending', booking_id: bookingId, detail: confirm.error }, 502)
    }
    confirmed = true
    externalId = confirm.id || externalId
  }
  if (!confirmed) {
    await cancelExternal(ready.secret, externalId, created.revision)
    await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    return json({ status: 'pending', booking_id: bookingId, detail: 'Wix did not confirm the booking.' }, 502)
  }

  const { error: markError } = await admin.rpc('mark_provider_confirmed', {
    p_booking_id: bookingId,
    p_external_booking_id: externalId,
  })
  if (markError) {
    const undone = await cancelExternal(ready.secret, externalId, null)
    if (undone) await admin.rpc('mark_cancelled', { p_booking_id: bookingId })
    else {
      await admin.rpc('mark_compensation_required', {
        p_booking_id: bookingId,
        p_detail: 'criação na Wix não foi desfeita',
      })
    }
    return json({
      error: markError.message,
      booking_id: bookingId,
      status: undone ? 'cancelled' : 'compensation_required',
    }, 502)
  }
  return json({ booking_id: bookingId, external_booking_id: externalId, status: 'provider_confirmed', homologated: false })
}

async function reschedule(caller: Caller, body: Body) {
  if (!body.booking_id || !body.starts_at) return json({ error: 'booking_id e starts_at são obrigatórios' }, 400)
  const startsAt = body.starts_at
  const booking = await loadBooking(body.booking_id)
  const denied = denyUnlessParty(caller, booking)
  if (denied) return denied
  if (!booking?.external_booking_id) return json({ error: 'reserva sem id externo' }, 422)
  const ready = await readyFor(serviceClient(), booking.professional_id, true)
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const place = await timeZoneOf(ready.secret)
  const day = place ? localWall(startsAt, place)?.slice(0, 10) : null
  if (!place || !day) return json({ status: 'pending', supported: false, detail: 'Invalid time.' }, 422)
  const opened = await openSlots(ready.secret, `${day}T00:00:00`, nextDay(day))
  if (opened.error) return opened.error
  const slot = opened.slots.find((item) => Date.parse(item.time) === Date.parse(startsAt))
  if (!slot) return json({ status: 'pending', supported: false, detail: 'That time is no longer available.' }, 422)
  const current = await getBooking(ready.secret, booking.external_booking_id)
  if (!current.ok || current.revision == null) return json({ status: 'pending', supported: false, detail: current.error }, 502)
  const moved = await wix(ready.secret, `/_api/bookings-service/v2/bookings/${booking.external_booking_id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({
      revision: current.revision,
      slot: slotBody(opened.service, slot, place),
      participantNotification: { notifyParticipants: false },
    }),
  })
  if (!moved.ok) return json({ status: 'pending', supported: false, detail: moved.error }, 502)
  const { error } = await serviceClient().rpc('mark_rescheduled', {
    p_booking_id: body.booking_id,
    p_starts_at: startsAt,
    p_origin: 'platform',
  })
  if (error) {
    await serviceClient().rpc('mark_compensation_required', {
      p_booking_id: body.booking_id,
      p_detail: 'reagendamento na Wix não gravou na plataforma',
    })
    return json({ error: error.message, status: 'compensation_required' }, 502)
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
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const current = await getBooking(ready.secret, booking.external_booking_id)
  if (!current.ok || current.revision == null) return json({ status: 'pending', supported: false, detail: current.error }, 502)
  const removed = await wix(ready.secret, `/_api/bookings-service/v2/bookings/${booking.external_booking_id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      revision: current.revision,
      participantNotification: { notifyParticipants: false },
    }),
  })
  if (!removed.ok) return json({ status: 'pending', supported: false, detail: removed.error }, 502)
  let { error } = await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })
  if (error) error = (await serviceClient().rpc('mark_cancelled', { p_booking_id: body.booking_id })).error
  if (error) {
    await serviceClient().rpc('mark_compensation_required', {
      p_booking_id: body.booking_id,
      p_detail: 'cancelamento na Wix não gravou na plataforma',
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
  if (ready.error || !ready.secret) return ready.error ?? json({ error: 'Wix is not ready.' }, 422)
  const current = await getBooking(ready.secret, booking.external_booking_id)
  if (!current.ok) return json({ status: 'pending', supported: false, detail: current.error }, 502)
  const place = await timeZoneOf(ready.secret)
  const externalStarts = current.start && place ? wallTimeToUtc(current.start, current.timeZone || place) : null
  const canceled = current.status === 'CANCELED' || current.status === 'CANCELLED'
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
      const { data: ordered } = await serviceClient()
        .from('calendar_order')
        .select('position')
        .eq('professional_id', professionalId)
        .eq('calendar_key', 'wix')
        .maybeSingle()
      if (!ordered) {
        return { error: json({ status: 'pending', supported: false, detail: 'profissional sem agenda externa' }, 422) } as const
      }
    }
  }
  const { data: connection } = await serviceClient()
    .from('schedule_connections')
    .select('id, external_resource_id')
    .eq('professional_id', professionalId)
    .eq('provider', 'wix')
    .maybeSingle()
  if (!connection?.external_resource_id) {
    return { error: json({ status: 'pending', supported: false, detail: 'Wix service is not chosen yet.' }, 422) } as const
  }
  const stored = await readStored(connection.id)
  if (!stored?.instanceId || stored.revoked || !stored.appId || !stored.appSecret) {
    return { error: json({ status: 'pending', supported: false, detail: 'Wix is not connected.' }, 422) } as const
  }
  return {
    secret: {
      appId: stored.appId,
      appSecret: stored.appSecret,
      instanceId: stored.instanceId,
      publicKeyPem: normalizePem(stored.publicKeyPem ?? ''),
      serviceId: connection.external_resource_id,
    } satisfies Secret,
  } as const
}

async function accountSecret(professionalId: string) {
  const { data: connection } = await serviceClient()
    .from('schedule_connections')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('provider', 'wix')
    .maybeSingle()
  if (!connection) return { error: json({ error: 'Connect with Wix before choosing a service.' }, 422) } as const
  const stored = await readStored(connection.id)
  if (!stored?.instanceId || stored.revoked || !stored.appId || !stored.appSecret) {
    return { error: json({ error: 'Connect with Wix before choosing a service.' }, 422) } as const
  }
  return { connectionId: connection.id as string, stored } as const
}

async function saveService(professionalId: string, connectionId: string, stored: Stored, serviceId: string) {
  const admin = serviceClient()
  const { data: existing } = await admin
    .from('schedule_connections')
    .select('status, external_resource_id')
    .eq('id', connectionId)
    .maybeSingle()
  const { data: otherSource } = await admin
    .from('schedule_connections')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('is_source', true)
    .neq('provider', 'wix')
    .maybeSingle()
  const status = existing?.status === 'tested' && existing.external_resource_id === serviceId ? 'tested' : 'pending'
  const { error } = await admin.from('schedule_connections').update({
    external_resource_id: serviceId,
    status,
    is_source: !otherSource,
  }).eq('id', connectionId)
  if (error) return { error: json({ error: error.message }, 400) } as const
  if (!otherSource) {
    await admin.from('professionals').update({
      schedule_mode: 'external',
      schedule_prompt_dismissed: true,
    }).eq('id', professionalId)
  }
  return { status } as const
}

async function openSlots(secret: Secret, fromLocal: string, toLocal: string) {
  const place = await timeZoneOf(secret)
  if (!place) return { error: json({ status: 'pending', supported: false, detail: 'Wix site has no time zone.' }, 422) } as const
  const service = await serviceChoice(secret)
  if (!service) return { error: json({ status: 'pending', supported: false, detail: 'Wix service was not found.' }, 422) } as const
  const from = clampLocal(fromLocal, place)
  const response = await wix(secret, '/_api/service-availability/v2/time-slots', {
    method: 'POST',
    body: JSON.stringify({
      serviceId: secret.serviceId,
      fromLocalDate: from,
      toLocalDate: toLocal,
      timeZone: place,
      bookable: true,
    }),
  })
  if (!response.ok) return { error: json({ status: 'pending', supported: false, detail: response.error }, 502) } as const
  return { service, slots: slotsFromPayload(response.payload, place) } as const
}

async function listServices(stored: Stored) {
  const secret = secretFrom(stored, 'discover')
  if (!secret) return { error: json({ error: 'Connect with Wix before choosing a service.' }, 422) } as const
  const response = await wix(secret, '/bookings/v2/services/query', {
    method: 'POST',
    body: JSON.stringify({ query: { paging: { limit: 50 } } }),
  })
  if (!response.ok) return { error: json({ error: response.error }, 502) } as const
  return { services: appointmentChoices(response.payload) } as const
}

async function serviceChoice(secret: Secret): Promise<WixServiceChoice | null> {
  const listed = await listServices(secret)
  if (listed.error || !listed.services) return null
  return listed.services.find((service) => service.id === secret.serviceId) ?? null
}

async function createBooking(secret: Secret, input: {
  service: WixServiceChoice
  slot: WixSlot
  timeZone: string
  email: string
  fullName: string
}) {
  const name = contactName(input.fullName)
  const response = await wix(secret, '/_api/bookings-service/v2/bookings', {
    method: 'POST',
    body: JSON.stringify({
      booking: {
        bookedEntity: { slot: slotBody(input.service, input.slot, input.timeZone) },
        contactDetails: { firstName: name.firstName, lastName: name.lastName, email: input.email },
        totalParticipants: 1,
      },
      participantNotification: { notifyParticipants: false },
    }),
  })
  const booking = asRecord(asRecord(response.payload)?.booking) ?? asRecord(response.payload)
  const id = text(booking?.id)
  if (!response.ok || !id) return { id: '', revision: null as unknown, status: '', error: response.error }
  return { id, revision: booking?.revision ?? null, status: text(booking?.status), error: '' }
}

async function confirmBooking(secret: Secret, bookingId: string, revision: unknown) {
  const response = await wix(secret, `/_api/bookings-service/v2/bookings/${bookingId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({
      revision,
      paymentStatus: 'NOT_PAID',
      participantNotification: { notifyParticipants: false },
    }),
  })
  const booking = asRecord(asRecord(response.payload)?.booking)
  return { ok: response.ok && text(booking?.status) === 'CONFIRMED', id: text(booking?.id), error: response.error }
}

async function cancelExternal(secret: Secret, bookingId: string, revision: unknown) {
  const current = revision == null ? await getBooking(secret, bookingId) : { ok: true, revision, error: '' }
  if (!current.ok || current.revision == null) return false
  const response = await wix(secret, `/_api/bookings-service/v2/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      revision: current.revision,
      participantNotification: { notifyParticipants: false },
    }),
  })
  return response.ok
}

async function getBooking(secret: Secret, bookingId: string) {
  const response = await wix(secret, `/_api/bookings-service/v2/bookings/${bookingId}`)
  const booking = asRecord(asRecord(response.payload)?.booking) ?? asRecord(response.payload)
  const slot = asRecord(asRecord(booking?.bookedEntity)?.slot)
  return {
    ok: response.ok && Boolean(booking),
    revision: booking?.revision ?? null,
    status: text(booking?.status),
    start: text(slot?.startDate),
    timeZone: text(slot?.timezone),
    error: response.error,
  }
}

function slotBody(service: WixServiceChoice, slot: WixSlot, timeZone: string) {
  return {
    serviceId: service.id,
    scheduleId: slot.scheduleId || service.scheduleId,
    startDate: slot.start,
    endDate: slot.end,
    timezone: timeZone,
    resource: { id: service.staffId },
    location: { locationType: 'OWNER_BUSINESS' },
  }
}

async function timeZoneOf(secret: Secret) {
  const response = await wix(secret, '/site-properties/v4/properties')
  const properties = asRecord(asRecord(response.payload)?.properties) ?? asRecord(response.payload)
  return text(properties?.timeZone) || null
}

async function wix(secret: Secret, path: string, init?: RequestInit) {
  const token = await accessToken(secret)
  if (!token) return { ok: false, payload: null, error: 'Wix did not issue a token.' }
  const response = await fetch(`https://www.wixapis.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok, payload, error: wixMessage(payload) }
}

async function accessToken(secret: Secret) {
  const response = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: secret.appId,
      client_secret: secret.appSecret,
      instance_id: secret.instanceId,
    }),
  })
  const payload = await response.json().catch(() => null)
  const token = asRecord(payload)?.access_token
  return response.ok && typeof token === 'string' ? token : ''
}

async function appCredentials() {
  const fromEnv = credentialsFromEnv()
  if (fromEnv) return fromEnv
  const { data } = await serviceClient().from('schedule_connections').select('id').eq('provider', 'wix')
  for (const row of data ?? []) {
    const stored = await readStored(row.id)
    if (stored?.appId && stored.appSecret && stored.publicKeyPem) {
      return {
        appId: stored.appId,
        appSecret: stored.appSecret,
        publicKeyPem: normalizePem(stored.publicKeyPem),
      }
    }
  }
  return null
}

function credentialsFromEnv() {
  const appId = Deno.env.get('WIX_APP_ID')?.trim() ?? ''
  const appSecret = Deno.env.get('WIX_APP_SECRET')?.trim() ?? ''
  const publicKeyPem = normalizePem(Deno.env.get('WIX_WEBHOOK_PUBLIC_KEY') ?? '')
  if (!appId || !appSecret || !publicKeyPem.includes('BEGIN PUBLIC KEY')) return null
  return { appId, appSecret, publicKeyPem }
}

function secretFrom(stored: Stored, serviceId: string): Secret | null {
  if (!stored.appId || !stored.appSecret || !stored.instanceId || stored.revoked) return null
  return {
    appId: stored.appId,
    appSecret: stored.appSecret,
    instanceId: stored.instanceId,
    publicKeyPem: normalizePem(stored.publicKeyPem ?? ''),
    serviceId,
  }
}

async function readStored(connectionId: string): Promise<Stored | null> {
  const { data, error } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: connectionId })
  if (error || typeof data !== 'string' || !data.trim()) return null
  try {
    const parsed = JSON.parse(data) as Stored
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
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

async function loadBooking(bookingId: string) {
  const { data } = await serviceClient()
    .from('bookings')
    .select('id, professional_id, external_booking_id, client_id, starts_at, saga_status, provider')
    .eq('id', bookingId)
    .eq('provider', 'wix')
    .maybeSingle()
  return data
}

function denyUnlessParty(caller: Caller, booking: { client_id: string } | null) {
  const allowed = caller.role === 'operacao' || (caller.role === 'cliente' && booking?.client_id === caller.id)
  if (!booking || !allowed) return json({ error: 'reserva indisponível' }, 403)
  return null
}

function pickService(rows: WixServiceChoice[], id?: string) {
  if (rows.length === 1 && !id) return rows[0]
  if (!id) return null
  return rows.find((row) => row.id === id) ?? null
}

function publicService(service: WixServiceChoice) {
  return { id: service.id, name: service.name }
}

function contactName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Client', lastName: 'Detox Pass' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Detox Pass' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function clampLocal(local: string, timeZone: string) {
  const utc = wallTimeToUtc(local, timeZone)
  if (!utc || Date.parse(utc) >= Date.now()) return local
  return localWall(new Date(Date.now() + 60_000).toISOString(), timeZone) ?? local
}

function nextDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day))
  next.setUTCDate(next.getUTCDate() + 1)
  return `${next.toISOString().slice(0, 10)}T00:00:00`
}

function nextMonth(month: string) {
  const [year, mon] = month.split('-').map(Number)
  const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
  return `${next}T00:00:00`
}

function wixMessage(payload: unknown) {
  const record = asRecord(payload)
  const message = text(record?.message) || text(record?.error)
  return message.slice(0, 240) || 'Wix did not accept this request.'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}
