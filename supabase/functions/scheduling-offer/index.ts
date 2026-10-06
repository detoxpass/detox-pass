import { appRole, json, preflight, requireUser } from '../_shared/supabase.ts'

type Body = {
  action?: string
  professional_id?: string
  service_id?: string
  city_id?: string
  starts_at?: string
  date?: string
  month?: string
}

const DOORS: Record<string, string> = {
  internal: 'scheduling-internal',
  square: 'scheduling-square',
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

  if (body.action === 'dates') return dates(req, body)
  if (body.action === 'availability') return availability(req, body)
  if (body.action === 'book') return book(req, appRole(auth.user), body)
  return json({ error: 'ação desconhecida' }, 400)
})

async function orderOf(req: Request, professionalId: string) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization') ?? ''
  if (!url || !key) return []
  const response = await fetch(
    `${url}/rest/v1/calendar_order?select=calendar_key,position&professional_id=eq.${encodeURIComponent(professionalId)}&order=position.asc`,
    { headers: { apikey: key, Authorization: authorization } },
  )
  const rows = await response.json().catch(() => [])
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || !('calendar_key' in row) || typeof row.calendar_key !== 'string') return []
    return DOORS[row.calendar_key] ? [row.calendar_key] : []
  })
}

async function callDoor(req: Request, calendar: string, payload: Record<string, unknown>) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const door = DOORS[calendar]
  if (!url || !key || !door) return { status: 422, body: null }
  const response = await fetch(`${url}/functions/v1/${door}`, {
    method: 'POST',
    headers: {
      Authorization: req.headers.get('Authorization') ?? '',
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

function timesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('times' in body) || !Array.isArray(body.times)) return []
  return body.times.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('time' in item) || typeof item.time !== 'string') return []
    return [item.time]
  })
}

function datesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('dates' in body) || !Array.isArray(body.dates)) return []
  return body.dates.filter((item): item is string => typeof item === 'string')
}

async function dates(req: Request, body: Body) {
  if (!body.professional_id || !body.month) return json({ error: 'professional_id e month são obrigatórios' }, 400)
  const calendars = await orderOf(req, body.professional_id)
  if (calendars.length === 0) {
    return json({ status: 'pending', supported: false, detail: 'profissional sem agenda', dates: [] }, 422)
  }
  const found = new Set<string>()
  for (const calendar of calendars) {
    const result = await callDoor(req, calendar, {
      action: 'dates',
      professional_id: body.professional_id,
      month: body.month,
    })
    for (const day of datesOf(result.body)) found.add(day)
  }
  return json({ dates: [...found].sort(), source: 'offer' })
}

async function openings(req: Request, professionalId: string, date: string, calendars: string[]) {
  const winner = new Map<string, string>()
  for (const calendar of calendars) {
    const result = await callDoor(req, calendar, {
      action: 'availability',
      professional_id: professionalId,
      date,
    })
    for (const time of timesOf(result.body)) {
      if (!winner.has(time)) winner.set(time, calendar)
    }
  }
  return winner
}

async function availability(req: Request, body: Body) {
  if (!body.professional_id || !body.date) return json({ error: 'professional_id e date são obrigatórios' }, 400)
  const calendars = await orderOf(req, body.professional_id)
  if (calendars.length === 0) {
    return json({ status: 'pending', supported: false, detail: 'profissional sem agenda', times: [] }, 422)
  }
  const winner = await openings(req, body.professional_id, body.date, calendars)
  const times = [...winner.keys()].sort((a, b) => Date.parse(a) - Date.parse(b))
  return json({ times: times.map((time) => ({ time })), source: 'offer' })
}

async function book(req: Request, role: string, body: Body) {
  if (role !== 'cliente') return json({ error: 'só a cliente reserva' }, 403)
  if (!body.professional_id || !body.service_id || !body.city_id || !body.starts_at) {
    return json({ error: 'professional_id, service_id, city_id e starts_at são obrigatórios' }, 400)
  }
  const calendars = await orderOf(req, body.professional_id)
  const instant = Date.parse(body.starts_at)
  if (!Number.isFinite(instant) || calendars.length === 0) {
    return json({ status: 'pending', supported: false, detail: 'horário não está mais disponível' }, 422)
  }
  const day = new Date(instant)
  const dates = [-1, 0, 1].map((offset) => {
    const next = new Date(day)
    next.setUTCDate(next.getUTCDate() + offset)
    return next.toISOString().slice(0, 10)
  })
  let chosen = ''
  for (const calendar of calendars) {
    for (const date of dates) {
      const result = await callDoor(req, calendar, {
        action: 'availability',
        professional_id: body.professional_id,
        date,
      })
      if (timesOf(result.body).some((time) => Date.parse(time) === instant)) {
        chosen = calendar
        break
      }
    }
    if (chosen) break
  }
  if (!chosen) return json({ status: 'pending', supported: false, detail: 'horário não está mais disponível' }, 422)
  const reserved = await callDoor(req, chosen, {
    action: 'book',
    professional_id: body.professional_id,
    service_id: body.service_id,
    city_id: body.city_id,
    starts_at: body.starts_at,
  })
  return json(reserved.body ?? { error: 'The reservation was not confirmed.' }, reserved.status)
}
