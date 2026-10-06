import {
  bindMentionedTerms,
  leftoverQuery,
  bookToken,
  canBook,
  capToolResult,
  clipText,
  isClinical,
  parseToolArgs,
  rankTier,
  readOpening,
  rejectAudio,
  relaxationSteps,
  sanitizeBlocks,
  selectToolCalls,
  signOpening,
  type SearchFilters,
} from '../_shared/agent.ts'
import { appRole, json, preflight, requireUser, type SupabaseClient } from '../_shared/supabase.ts'

const CLINICAL_TEXT = 'Detox Pass books massage. It does not give treatment advice.'
const TURN_MS = 20_000

type Block = Record<string, unknown>
type Person = {
  id: string
  display_name: string
  portrait_path: string | null
  schedule_mode: 'internal' | 'external' | null
  services: { id: string; name: string; price_cents: number | null; currency: string | null }[]
  cities: { id: string; name: string }[]
  specialties: { id: string; name: string }[]
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const actionHeader = req.headers.get('content-type') ?? ''
  if (actionHeader.includes('multipart/form-data')) {
    return transcribe(req)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const action = typeof body.action === 'string' ? body.action : 'turn'
  try {
    if (action === 'transcribe') return await transcribe(req, body)
    if (action === 'book') return await book(req, auth.client, auth.user.id, appRole(auth.user), body)
    if (action === 'search' || action === 'professional' || action === 'account' || action === 'openings') {
      return await directTool(req, auth.client, auth.user, action, body)
    }
    if (action === 'turn') return await turn(req, auth.client, auth.user, body)
  } catch {
    return json({ error: 'The conversation could not be saved.' }, 500)
  }
  return json({ error: 'Unknown action.' }, 400)
})

async function directTool(req: Request, client: SupabaseClient, user: { id: string; email?: string }, action: string, body: Record<string, unknown>) {
  const name = action === 'search' ? 'search_professionals' : action === 'professional' ? 'get_professional' : action === 'account' ? 'get_my_account' : 'get_openings'
  const nested = body.arguments
  const source = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested
    : Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'action' && key !== 'thread_id'))
  const parsed = parseToolArgs(name, source)
  if (!parsed.ok) return json({ blocks: [{ type: 'error', text: parsed.error }], model_called: false }, 400)
  const ran = await runTool(req, client, user, name, parsed.args)
  return json({ blocks: sanitizeBlocks(ran.blocks), model_called: false })
}

async function turn(req: Request, client: SupabaseClient, user: { id: string; email?: string; app_metadata?: Record<string, unknown> }, body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return json({ error: 'Write a message first.' }, 400)
  const fromAudio = body.from_audio === true
  const deadline = Date.now() + TURN_MS
  const threadId = await ensureThread(client, user.id, typeof body.thread_id === 'string' ? body.thread_id : '')
  await insertMessage(client, threadId, user.id, 'user', clipText(text), [{ type: 'user', text: clipText(text), from_audio: fromAudio }], fromAudio)

  if (isClinical(text)) {
    const blocks = [{ type: 'text', text: CLINICAL_TEXT }]
    await insertMessage(client, threadId, user.id, 'assistant', CLINICAL_TEXT, blocks, false)
    return json({ thread_id: threadId, blocks, model_called: false })
  }

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) {
    const blocks = [{ type: 'pending', text: 'The assistant is not configured yet. Search on the find page still works.' }]
    await insertMessage(client, threadId, user.id, 'assistant', String(blocks[0].text), blocks, false)
    return json({ thread_id: threadId, blocks, model_called: false })
  }

  const history = await recentMessages(client, threadId)
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt() },
    ...history,
  ]
  const blocks: Block[] = []
  let used = 0
  let limited = false
  let modelCalled = false
  let reply = ''

  for (let round = 0; round < 4; round += 1) {
    if (Date.now() > deadline) {
      limited = true
      break
    }
    const remaining = Math.max(1, deadline - Date.now())
    let completion: { content: string; calls: { id: string; name: string; arguments: string }[] }
    try {
      modelCalled = true
      completion = await complete(key, messages, AbortSignal.timeout(remaining))
    } catch {
      blocks.push({ type: 'error', text: 'The assistant could not answer just now.' })
      break
    }
    if (completion.calls.length === 0) {
      reply = clipText(completion.content.trim())
      break
    }
    const selected = selectToolCalls(completion.calls, used)
    used = selected.used
    if (selected.limited) limited = true
    messages.push({
      role: 'assistant',
      content: completion.content || null,
      tool_calls: selected.run.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    })
    for (const call of selected.run) {
      if (Date.now() > deadline) {
        limited = true
        break
      }
      let args: unknown = {}
      try {
        args = JSON.parse(call.arguments || '{}')
      } catch {
        args = {}
      }
      const parsed = parseToolArgs(call.name, args)
      if (!parsed.ok) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: parsed.error })
        blocks.push({ type: 'error', text: parsed.error })
        continue
      }
      const ran = await runTool(req, client, user, call.name, parsed.args)
      const capped = capToolResult(ran.model)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(capped.result) })
      blocks.push(...ran.blocks)
      if (capped.truncated) blocks.push({ type: 'limit', text: 'The list was shortened.' })
    }
    if (limited) break
  }

  if (reply) blocks.unshift({ type: 'text', text: reply })
  if (limited) blocks.push({ type: 'limit', text: 'Ask again to see more.' })
  const safe = sanitizeBlocks(blocks.length ? blocks : [{ type: 'text', text: 'Tell me a service or a city.' }])
  const bodyText = safe.flatMap((block) => typeof block.text === 'string' ? [block.text] : []).join(' ').slice(0, 500) || 'Here is what I found.'
  await insertMessage(client, threadId, user.id, 'assistant', bodyText, storedBlocks(safe), false)
  return json({ thread_id: threadId, blocks: safe, model_called: modelCalled })
}

async function book(req: Request, client: SupabaseClient, userId: string, role: string, body: Record<string, unknown>) {
  const parsed = bookToken(body)
  if (!parsed.ok) return json({ blocks: [{ type: 'error', text: parsed.error }], model_called: false }, 400)
  if (!canBook(role)) {
    return json({ blocks: [{ type: 'error', text: 'Only a client can book.' }], model_called: false })
  }
  const secret = Deno.env.get('OPENING_TOKEN_SECRET')
  if (!secret) return json({ blocks: [{ type: 'pending', text: 'Booking from chat is not configured yet.' }], model_called: false })
  const claims = await readOpening(secret, parsed.token)
  if (!claims || claims.user_id !== userId) {
    return json({ blocks: [{ type: 'error', text: 'That time is no longer available. Ask for the schedule again.' }], model_called: false })
  }
  const result = await callDoor(req, 'scheduling-internal', {
    action: 'book',
    professional_id: claims.professional_id,
    service_id: claims.service_id,
    city_id: claims.city_id,
    starts_at: claims.starts_at,
  })
  const payload = result.body as { booking_id?: string; status?: string; error?: string; detail?: string }
  if (payload.status !== 'provider_confirmed' || !payload.booking_id) {
    return json({
      blocks: [{ type: 'error', text: bookingError(payload.detail || payload.error || '') }],
      model_called: false,
    })
  }
  const names = await namesFor(req, claims)
  const blocks = [{
    type: 'booking_receipt',
    booking_id: payload.booking_id,
    status: 'provider_confirmed',
    starts_at: claims.starts_at,
    service: names.service,
    city: names.city,
    professional: names.professional,
  }]
  const requested = typeof body.thread_id === 'string' ? body.thread_id : ''
  if (requested) {
    try {
      const threadId = await ensureThread(client, userId, requested)
      await insertMessage(client, threadId, userId, 'assistant', `${names.service} reserved`, blocks, false)
    } catch {
      // The reservation already exists. The receipt still goes back to the screen.
    }
  }
  return json({ blocks, model_called: false })
}

async function transcribe(req: Request, body?: Record<string, unknown>) {
  let bytes = new Uint8Array()
  let mime = ''
  let duration = Number.NaN
  if (body) {
    mime = typeof body.mime === 'string' ? body.mime : ''
    duration = typeof body.duration_seconds === 'number' ? body.duration_seconds : Number.NaN
    if (typeof body.audio_base64 === 'string') {
      try {
        const binary = atob(body.audio_base64)
        bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      } catch {
        return json({ error: 'The recording could not be read.' }, 400)
      }
    }
  } else {
    const form = await req.formData()
    const file = form.get('audio')
    mime = typeof form.get('mime') === 'string' ? String(form.get('mime')) : file instanceof File ? file.type : ''
    duration = Number(form.get('duration_seconds'))
    if (file instanceof File) bytes = new Uint8Array(await file.arrayBuffer())
  }
  const reason = rejectAudio({ bytes: bytes.byteLength, mime, durationSeconds: duration })
  if (reason) return json({ error: reason }, 400)
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ blocks: [{ type: 'pending', text: 'Transcription is not configured yet. You can still type.' }], model_called: false })
  const model = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe'
  const form = new FormData()
  form.set('model', model)
  form.set('file', new File([bytes], mime.includes('mp4') ? 'note.mp4' : 'note.webm', { type: mime.split(';')[0] }))
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  const payload = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string } }
  if (!response.ok || !payload.text) {
    return json({ error: 'The recording could not be transcribed.' }, 502)
  }
  return json({ text: payload.text, model_called: true })
}

async function runTool(req: Request, client: SupabaseClient, user: { id: string; email?: string }, name: string, args: Record<string, unknown>) {
  if (name === 'search_professionals') return search(client, args)
  if (name === 'get_professional') return professional(client, String(args.professional_id))
  if (name === 'get_my_account') return account(client, user)
  if (name === 'get_openings') return openings(req, client, user.id, args)
  return { model: { error: 'Unknown tool.' }, blocks: [{ type: 'error', text: 'Unknown tool.' }] as Block[] }
}

async function search(client: SupabaseClient, args: Record<string, unknown>) {
  const filters: SearchFilters = {
    query: typeof args.query === 'string' ? args.query.slice(0, 80) : '',
    serviceIds: ids(args.service_ids),
    cityIds: ids(args.city_ids),
    specialtyIds: ids(args.specialty_ids),
  }
  const catalog = await catalogTerms(client)
  const mentioned = bindMentionedTerms(filters.query, catalog, filters)
  const bound = { ...mentioned, query: leftoverQuery(filters.query, catalog) }
  const steps = relaxationSteps(bound)
  let matches: Person[] = []
  let unknown: string[] = []
  let relaxed: string[] = []
  for (const step of steps) {
    const found = await searchOnce(client, step.filters)
    if (step.relaxed.length === 0) unknown = found.unknown
    if (found.matches.length > 0) {
      matches = sortPeople(found.matches, step.filters)
      relaxed = step.relaxed
      break
    }
    relaxed = step.relaxed
  }
  const people = matches.map(card)
  if (people.length === 0) {
    return {
      model: { matches: [], unknown_ids: unknown, relaxed },
      blocks: [{ type: 'empty', relaxed, unknown_ids: unknown }] as Block[],
    }
  }
  return {
    model: { matches: people.map(({ photo: _photo, ...person }) => person), unknown_ids: unknown, relaxed },
    blocks: [{ type: 'professional_cards', people, relaxed }] as Block[],
  }
}

async function professional(client: SupabaseClient, id: string) {
  const { data } = await client
    .from('professionals')
    .select('id,display_name,portrait_path,schedule_mode,active,professional_services(services(id,name,price_cents,currency)),professional_cities(cities(id,name)),professional_specialties(specialties(id,name))')
    .eq('id', id)
    .maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row || row.active !== true) {
    return { model: { error: 'not_found' }, blocks: [{ type: 'empty', relaxed: [], text: 'That professional is not available.' }] as Block[] }
  }
  const person = card(personFromRow(row))
  return { model: person, blocks: [{ type: 'professional_detail', professional: person }] as Block[] }
}

async function account(client: SupabaseClient, user: { id: string; email?: string }) {
  const [{ data: profile }, { data: bookings }] = await Promise.all([
    client.from('profiles').select('full_name,role').eq('id', user.id).maybeSingle(),
    client.from('bookings').select('id,starts_at,saga_status,services(name),cities(name),professionals(display_name)').eq('client_id', user.id).gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(8),
  ])
  const row = profile as { full_name?: string; role?: string } | null
  const list = ((bookings ?? []) as Record<string, unknown>[]).map((item) => ({
    id: item.id,
    starts_at: item.starts_at,
    status: item.saga_status,
    service: named(item.services),
    city: named(item.cities),
    professional: named(item.professionals, 'display_name'),
  }))
  const payload = { name: row?.full_name ?? '', email: user.email ?? '', role: row?.role ?? '', bookings: list }
  return { model: payload, blocks: [{ type: 'account', ...payload }] as Block[] }
}

async function openings(req: Request, client: SupabaseClient, userId: string, args: Record<string, unknown>) {
  const professionalId = String(args.professional_id)
  const date = typeof args.date === 'string' ? args.date : ''
  const { data } = await client
    .from('professionals')
    .select('id,display_name,schedule_mode,active,professional_services(service_id,services(id,name)),professional_cities(city_id,cities(id,name))')
    .eq('id', professionalId)
    .maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row || row.active !== true) {
    return { model: { error: 'not_found' }, blocks: [{ type: 'empty', relaxed: [] }] as Block[] }
  }
  const services = links(row.professional_services, 'services')
  const cities = links(row.professional_cities, 'cities')
  let serviceId = typeof args.service_id === 'string' ? args.service_id : ''
  let cityId = typeof args.city_id === 'string' ? args.city_id : ''
  if (!serviceId && services.length === 1) serviceId = services[0].id
  if (!cityId && cities.length === 1) cityId = cities[0].id
  if ((!serviceId && services.length !== 1) || (!cityId && cities.length !== 1)) {
    return {
      model: { choice: true, services, cities },
      blocks: [{ type: 'choice', professional_id: professionalId, date, services, cities }] as Block[],
    }
  }
  if (!services.some((item) => item.id === serviceId) || !cities.some((item) => item.id === cityId)) {
    return { model: { error: 'not_offered' }, blocks: [{ type: 'error', text: 'That service is not offered in that city.' }] as Block[] }
  }
  if (!date) {
    return { model: { error: 'date_required' }, blocks: [{ type: 'error', text: 'Pick a day first.' }] as Block[] }
  }
  const mode = row.schedule_mode
  if (mode == null) {
    return { model: { status: 'unavailable', times: [] }, blocks: [{ type: 'pending', text: 'This profile has not chosen a calendar yet.' }] as Block[] }
  }
  if (mode === 'external') {
    const external = await callDoor(req, 'scheduling-acuity', { action: 'availability', professional_id: professionalId, date })
    const payload = external.body as { status?: string }
    const text = external.status >= 400 || payload.status === 'pending'
      ? 'The external calendar is not connected. No times are listed.'
      : 'Booking in chat is available for the Detox Pass calendar.'
    return { model: { status: 'pending', times: [] }, blocks: [{ type: 'pending', text }] as Block[] }
  }
  const listed = await callDoor(req, 'scheduling-internal', { action: 'availability', professional_id: professionalId, date })
  const times = timesOf(listed.body).slice(0, 12)
  const secret = Deno.env.get('OPENING_TOKEN_SECRET')
  if (!secret) {
    return { model: { status: 'pending', times: [] }, blocks: [{ type: 'pending', text: 'Times cannot be reserved from chat yet.' }] as Block[] }
  }
  const exp = Math.floor(Date.now() / 1000) + 600
  const signed = []
  for (const time of times) {
    signed.push({
      starts_at: time.starts_at,
      opening_token: await signOpening(secret, {
        user_id: userId,
        professional_id: professionalId,
        service_id: serviceId,
        city_id: cityId,
        starts_at: time.starts_at,
        exp,
      }),
    })
  }
  const service = services.find((item) => item.id === serviceId)?.name ?? ''
  const city = cities.find((item) => item.id === cityId)?.name ?? ''
  return {
    model: { date, service, city, times: signed.map((item) => item.starts_at) },
    blocks: [{
      type: 'openings',
      professional_id: professionalId,
      professional: row.display_name,
      date,
      service_id: serviceId,
      city_id: cityId,
      service,
      city,
      times: signed,
    }] as Block[],
  }
}

function systemPrompt() {
  return [
    'You are the Detox Pass assistant for the signed-in client.',
    'Use only tool results. Never invent a therapist, a time, a price, a review, or a point balance.',
    'Do not give medical advice.',
    'Put the client words in query. Do not invent ids. Pass an id only when an earlier tool returned it.',
    'You cannot book. If the client names a time, call get_openings so they can tap a real slot.',
    `Today in UTC is ${new Date().toISOString().slice(0, 10)}. Use that date unless the client names another day.`,
    'Reply in English, under 500 characters.',
  ].join(' ')
}

async function complete(key: string, messages: Record<string, unknown>[], signal: AbortSignal) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
      temperature: 0.2,
      messages,
      tools: toolSchema(),
    }),
  })
  const payload = await response.json() as {
    choices?: { message?: { content?: string; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[]
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(payload.error?.message || 'model')
  const message = payload.choices?.[0]?.message
  const calls = (message?.tool_calls ?? []).flatMap((call) => call.function?.name ? [{
    id: call.id,
    name: call.function.name,
    arguments: call.function.arguments || '{}',
  }] : [])
  return { content: message?.content ?? '', calls }
}

function toolSchema() {
  const id = { type: 'string' }
  const ids = { type: 'array', items: id, maxItems: 3 }
  return [
    { type: 'function', function: { name: 'search_professionals', description: 'Find active professionals by text, service, city, or specialty.', parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string' }, service_ids: ids, city_ids: ids, specialty_ids: ids } } } },
    { type: 'function', function: { name: 'get_professional', description: 'Public profile for one active professional.', parameters: { type: 'object', additionalProperties: false, required: ['professional_id'], properties: { professional_id: id } } } },
    { type: 'function', function: { name: 'get_my_account', description: 'The signed-in person and their own upcoming reservations.', parameters: { type: 'object', additionalProperties: false, properties: { user_id: id, id, profile_id: id } } } },
    { type: 'function', function: { name: 'get_openings', description: 'Real open times for one professional on one day.', parameters: { type: 'object', additionalProperties: false, required: ['professional_id'], properties: { professional_id: id, service_id: id, city_id: id, date: { type: 'string' } } } } },
  ]
}

async function searchOnce(client: SupabaseClient, filters: SearchFilters) {
  const { data, error } = await client.rpc('search_professionals', {
    p_query: filters.query,
    p_service_ids: filters.serviceIds,
    p_city_ids: filters.cityIds,
    p_specialty_ids: filters.specialtyIds,
    p_limit: 8,
  })
  if (error || !data || typeof data !== 'object') return { matches: [] as Person[], unknown: [] as string[] }
  const payload = data as { matches?: Person[]; unknown_ids?: string[] }
  return { matches: payload.matches ?? [], unknown: payload.unknown_ids ?? [] }
}

function sortPeople(matches: Person[], filters: SearchFilters) {
  return [...matches].sort((a, b) => {
    const left = rankTier(rankOf(a), filters.query, filters)
    const right = rankTier(rankOf(b), filters.query, filters)
    return left - right || a.display_name.localeCompare(b.display_name)
  })
}

function rankOf(person: Person) {
  return {
    name: person.display_name,
    active: true,
    serviceIds: person.services.map((item) => item.id),
    cityIds: person.cities.map((item) => item.id),
    specialtyIds: person.specialties.map((item) => item.id),
  }
}

async function catalogTerms(client: SupabaseClient) {
  const [{ data: services }, { data: cities }, { data: specialties }] = await Promise.all([
    client.from('services').select('id,name,slug'),
    client.from('cities').select('id,name,slug'),
    client.from('specialties').select('id,name,slug'),
  ])
  return {
    services: (services ?? []) as { id: string; name: string; slug: string }[],
    cities: (cities ?? []) as { id: string; name: string; slug: string }[],
    specialties: (specialties ?? []) as { id: string; name: string; slug: string }[],
  }
}

function personFromRow(row: Record<string, unknown>): Person {
  return {
    id: String(row.id),
    display_name: String(row.display_name),
    portrait_path: typeof row.portrait_path === 'string' ? row.portrait_path : null,
    schedule_mode: row.schedule_mode === 'internal' || row.schedule_mode === 'external' ? row.schedule_mode : null,
    services: links(row.professional_services, 'services').map((item) => ({ ...item, price_cents: item.price_cents ?? null, currency: item.currency ?? null })),
    cities: links(row.professional_cities, 'cities'),
    specialties: links(row.professional_specialties, 'specialties'),
  }
}

function links(value: unknown, key: string) {
  if (!Array.isArray(value)) return [] as { id: string; name: string; price_cents?: number | null; currency?: string | null }[]
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const nested = (item as Record<string, unknown>)[key]
    if (!nested || typeof nested !== 'object') return []
    const row = nested as { id?: string; name?: string; price_cents?: number | null; currency?: string | null }
    if (!row.id || !row.name) return []
    return [{ id: row.id, name: row.name, price_cents: row.price_cents ?? null, currency: row.currency ?? null }]
  })
}

function card(person: Person) {
  return {
    id: person.id,
    name: person.display_name,
    photo: person.portrait_path || '/people/splash.jpg',
    schedule_mode: person.schedule_mode,
    services: person.services,
    cities: person.cities,
    specialties: person.specialties,
  }
}

function ids(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 3) : []
}

function named(value: unknown, key = 'name') {
  if (Array.isArray(value)) return named(value[0], key)
  if (!value || typeof value !== 'object') return ''
  const text = (value as Record<string, unknown>)[key]
  return typeof text === 'string' ? text : ''
}

function timesOf(body: unknown) {
  if (!body || typeof body !== 'object') return [] as { starts_at: string }[]
  const times = (body as { times?: unknown }).times
  if (!Array.isArray(times)) return []
  return times.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const time = (item as { time?: unknown }).time
    return typeof time === 'string' ? [{ starts_at: time }] : []
  })
}

function storedBlocks(blocks: { type: string; text?: string }[]) {
  return blocks.map((block) => {
    const times = (block as { times?: unknown }).times
    if (block.type !== 'openings' || !Array.isArray(times)) return block
    return {
      ...block,
      times: times.flatMap((item) => {
        if (!item || typeof item !== 'object' || typeof (item as { starts_at?: unknown }).starts_at !== 'string') return []
        return [{ starts_at: (item as { starts_at: string }).starts_at }]
      }),
    }
  })
}

function bookingError(message: string) {
  if (message.includes('já tem reserva') || message.includes('não está aberto')) return 'That time is no longer open.'
  if (message.includes('não oferece')) return 'That service is not offered in that city.'
  if (message.includes('só a cliente')) return 'Only a client can book.'
  return 'The reservation was not created.'
}

async function namesFor(req: Request, claims: { professional_id: string; service_id: string; city_id: string }) {
  const auth = await requireUser(req)
  if (auth.error) return { service: '', city: '', professional: '' }
  const [{ data: service }, { data: city }, { data: professional }] = await Promise.all([
    auth.client.from('services').select('name').eq('id', claims.service_id).maybeSingle(),
    auth.client.from('cities').select('name').eq('id', claims.city_id).maybeSingle(),
    auth.client.from('professionals').select('display_name').eq('id', claims.professional_id).maybeSingle(),
  ])
  return {
    service: (service as { name?: string } | null)?.name ?? '',
    city: (city as { name?: string } | null)?.name ?? '',
    professional: (professional as { display_name?: string } | null)?.display_name ?? '',
  }
}

async function callDoor(req: Request, name: string, body: unknown) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization') ?? ''
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: key ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, body: payload }
}

async function ensureThread(client: SupabaseClient, userId: string, threadId: string) {
  if (threadId) {
    const { data } = await client.from('chat_threads').select('id').eq('id', threadId).maybeSingle()
    if (data && typeof data === 'object' && 'id' in data) return String(data.id)
  }
  const { data, error } = await client.from('chat_threads').insert({ profile_id: userId }).select('id').single()
  if (error || !data) throw new Error('Could not open the conversation.')
  return String((data as { id: string }).id)
}

async function insertMessage(client: SupabaseClient, threadId: string, userId: string, role: 'user' | 'assistant', body: string, blocks: unknown, fromAudio: boolean) {
  await client.from('chat_messages').insert({
    thread_id: threadId,
    profile_id: userId,
    role,
    body,
    blocks,
    from_audio: fromAudio,
  })
}

async function recentMessages(client: SupabaseClient, threadId: string) {
  const { data } = await client.from('chat_messages').select('role,body').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(8)
  return ((data ?? []) as { role: string; body: string }[]).reverse().map((item) => ({ role: item.role, content: item.body }))
}
