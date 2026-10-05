import { json, preflight, requireUser } from '../_shared/supabase.ts'

type Body = {
  service_id?: string
  city_id?: string
  query?: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const auth = await requireUser(req)
  if (auth.error) return auth.error

  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const query = (body.query ?? '').trim().toLowerCase()
  let allowed: string[] | null = null

  if (body.service_id) {
    const { data: links, error } = await auth.client
      .from('professional_services')
      .select('professional_id')
      .eq('service_id', body.service_id)
    if (error) return json({ error: error.message }, 400)
    allowed = (links ?? []).map((row) => row.professional_id)
  }

  if (body.city_id) {
    const { data: links, error } = await auth.client
      .from('professional_cities')
      .select('professional_id')
      .eq('city_id', body.city_id)
    if (error) return json({ error: error.message }, 400)
    const cityIds = (links ?? []).map((row) => row.professional_id)
    allowed = allowed ? allowed.filter((id) => cityIds.includes(id)) : cityIds
  }

  let request = auth.client.from('professionals').select('id, display_name').eq('active', true)
  if (allowed) {
    request = request.in('id', allowed.length ? allowed : ['00000000-0000-0000-0000-000000000000'])
  }

  const [{ data: people, error: peopleError }, { data: services }, { data: cities }] = await Promise.all([
    request,
    auth.client.from('services').select('id, name, slug, price_cents, currency'),
    auth.client.from('cities').select('id, name, slug'),
  ])

  if (peopleError) return json({ error: peopleError.message }, 400)

  const matches = (people ?? []).filter((person) => {
    if (!query) return true
    return String(person.display_name).toLowerCase().includes(query)
  })

  return json({
    matches,
    services: services ?? [],
    cities: cities ?? [],
    model_configured: false,
    detail: 'Provedor de IA ainda não aprovado. A resposta usa só o catálogo da plataforma e não inclui horário.',
  })
})
