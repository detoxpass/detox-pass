import { serviceClient } from './supabase.ts'
import {
  SQUARE_VERSION,
  durationMinutes,
  shouldRefreshSquareToken,
  squareHost,
} from './square.ts'

export type SquareEnvironment = 'sandbox' | 'production'

export type SquareChoice = {
  locations: { id: string; name: string; timezone: string }[]
  members: { id: string; name: string }[]
  services: { variationId: string; name: string; minutes: number }[]
}

export type SquareSecret = {
  environment: SquareEnvironment
  accessToken: string
  locationId: string
  teamMemberId: string
  serviceVariationId: string
  refreshToken?: string
  expiresAt?: string
  refreshedAt?: string
  merchantId?: string
  obtainedVia?: 'oauth' | 'paste'
}

export type SquareStored = {
  environment: SquareEnvironment
  accessToken?: string
  locationId?: string
  teamMemberId?: string
  serviceVariationId?: string
  refreshToken?: string
  expiresAt?: string
  refreshedAt?: string
  merchantId?: string
  obtainedVia?: 'oauth' | 'paste'
  revoked?: boolean
}

type Discover =
  | { ok: true; choice: SquareChoice }
  | { ok: false; status: number; error: string; detail?: unknown; choice?: SquareChoice }

export function squareCredentials(environment: string): { id: string; secret: string } | null {
  const pair = environment === 'production'
    ? ['SQUARE_PRODUCTION_APPLICATION_ID', 'SQUARE_PRODUCTION_APPLICATION_SECRET']
    : environment === 'sandbox'
      ? ['SQUARE_SANDBOX_APPLICATION_ID', 'SQUARE_SANDBOX_APPLICATION_SECRET']
      : null
  if (!pair) return null
  const id = Deno.env.get(pair[0])?.trim() ?? ''
  const secret = Deno.env.get(pair[1])?.trim() ?? ''
  if (!id || !secret) return null
  return { id, secret }
}

export function parseStored(raw: string | null | undefined): SquareStored | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SquareStored>
    if (parsed.environment !== 'sandbox' && parsed.environment !== 'production') return null
    return parsed as SquareStored
  } catch {
    return null
  }
}

export function bookingSecret(stored: SquareStored | null, resourceId?: string | null): SquareSecret | null {
  if (!stored?.accessToken || stored.revoked) return null
  const serviceVariationId = stored.serviceVariationId || resourceId || ''
  if (!stored.locationId || !stored.teamMemberId || !serviceVariationId) return null
  if (stored.locationId === 'discover' || serviceVariationId === 'discover') return null
  return {
    environment: stored.environment,
    accessToken: stored.accessToken,
    locationId: stored.locationId,
    teamMemberId: stored.teamMemberId,
    serviceVariationId,
    refreshToken: stored.refreshToken,
    expiresAt: stored.expiresAt,
    refreshedAt: stored.refreshedAt,
    merchantId: stored.merchantId,
    obtainedVia: stored.obtainedVia,
  }
}

export function mergePastedSecret(previous: SquareStored | null, next: SquareSecret): SquareStored {
  const sameToken = previous?.accessToken === next.accessToken && previous.environment === next.environment
  if (sameToken && previous?.obtainedVia === 'oauth' && previous.refreshToken) {
    return {
      ...previous,
      locationId: next.locationId,
      teamMemberId: next.teamMemberId,
      serviceVariationId: next.serviceVariationId,
      accessToken: next.accessToken,
      obtainedVia: 'oauth',
      revoked: false,
    }
  }
  return {
    environment: next.environment,
    accessToken: next.accessToken,
    locationId: next.locationId,
    teamMemberId: next.teamMemberId,
    serviceVariationId: next.serviceVariationId,
    obtainedVia: 'paste',
    refreshedAt: new Date().toISOString(),
    revoked: false,
  }
}

export async function readStored(connectionId: string): Promise<SquareStored | null> {
  const { data, error } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: connectionId })
  if (error) return null
  return parseStored(typeof data === 'string' ? data : null)
}

export async function writeStored(connectionId: string, stored: SquareStored): Promise<string | null> {
  const { error } = await serviceClient().rpc('store_calendar_secret', {
    p_connection_id: connectionId,
    p_token: JSON.stringify(stored),
  })
  return error?.message ?? null
}

export function squareFetch(environment: string, accessToken: string, path: string, init: RequestInit = {}) {
  const host = squareHost(environment)
  if (!host) return Promise.resolve(new Response(JSON.stringify({ error: 'ambiente Square desconhecido' }), { status: 422 }))
  return fetch(`${host}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'Square-Version': SQUARE_VERSION,
      ...(init.headers ?? {}),
    },
  })
}

async function obtainToken(environment: SquareEnvironment, body: Record<string, unknown>) {
  const host = squareHost(environment)
  if (!host) return { ok: false as const, status: 422, body: null }
  const response = await fetch(`${host}/oauth2/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, body: payload }
}

export async function ensureFreshSquare(connectionId: string, secret: SquareSecret): Promise<SquareSecret | { expired: true }> {
  if (!shouldRefreshSquareToken(secret)) return secret
  const creds = squareCredentials(secret.environment)
  if (!creds || !secret.refreshToken) return secret
  const renewed = await obtainToken(secret.environment, {
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: 'refresh_token',
    refresh_token: secret.refreshToken,
  })
  const accessToken = renewed.body?.access_token
  const expiresAt = renewed.body?.expires_at
  if (!renewed.ok || typeof accessToken !== 'string') {
    const expires = secret.expiresAt ? Date.parse(secret.expiresAt) : Number.NaN
    if (Number.isFinite(expires) && expires > Date.now()) return secret
    return { expired: true }
  }
  const previous = await readStored(connectionId)
  const refreshedAt = new Date().toISOString()
  const next: SquareSecret = {
    ...secret,
    accessToken,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : secret.expiresAt,
    refreshedAt,
    refreshToken: typeof renewed.body?.refresh_token === 'string' ? renewed.body.refresh_token : secret.refreshToken,
    merchantId: typeof renewed.body?.merchant_id === 'string' ? renewed.body.merchant_id : secret.merchantId,
  }
  await writeStored(connectionId, {
    ...(previous ?? {}),
    environment: next.environment,
    accessToken: next.accessToken,
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
    refreshedAt,
    merchantId: next.merchantId,
    obtainedVia: previous?.obtainedVia ?? next.obtainedVia,
    revoked: false,
    locationId: previous?.locationId && previous.locationId !== 'discover' ? previous.locationId : next.locationId,
    teamMemberId: previous?.teamMemberId && previous.teamMemberId !== 'discover' ? previous.teamMemberId : next.teamMemberId,
    serviceVariationId: previous?.serviceVariationId && previous.serviceVariationId !== 'discover'
      ? previous.serviceVariationId
      : next.serviceVariationId,
  })
  return next
}

export async function discoverSquare(environment: SquareEnvironment, accessToken: string): Promise<Discover> {
  const [locationsResponse, membersResponse, services] = await Promise.all([
    squareFetch(environment, accessToken, '/v2/locations'),
    squareFetch(environment, accessToken, '/v2/team-members/search', {
      method: 'POST',
      body: JSON.stringify({ query: { filter: { status: 'ACTIVE' } }, limit: 25 }),
    }),
    listBookableServices(environment, accessToken),
  ])
  const locationsBody = await locationsResponse.json().catch(() => null)
  const membersBody = await membersResponse.json().catch(() => null)
  if (locationsResponse.status === 401 || membersResponse.status === 401 || services.status === 401) {
    return { ok: false, status: 401, error: 'Square did not accept this access token.' }
  }
  if (!locationsResponse.ok) return { ok: false, status: locationsResponse.status, error: 'Square did not list locations.', detail: locationsBody }
  if (!membersResponse.ok) return { ok: false, status: membersResponse.status, error: 'Square did not list team members.', detail: membersBody }
  if (!services.ok) return { ok: false, status: services.status, error: 'Square did not list services.', detail: services.detail }
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
  const choice = { locations, members, services: services.rows }
  if (locations.length === 0 || members.length === 0 || services.rows.length === 0) {
    return { ok: false, status: 422, error: 'Square did not return a location, a person, and a bookable service.', detail: 'Square não devolveu unidade, pessoa ou serviço de agenda', choice }
  }
  return { ok: true, choice }
}

async function listBookableServices(environment: SquareEnvironment, accessToken: string) {
  const rows: SquareChoice['services'] = []
  let cursor = ''
  for (let page = 0; page < 5; page += 1) {
    const path = `/v2/catalog/list?types=${encodeURIComponent('ITEM')}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const response = await squareFetch(environment, accessToken, path)
    const payload = await response.json().catch(() => null)
    if (!response.ok) return { ok: false as const, status: response.status, detail: payload, rows }
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
  return { ok: true as const, status: 200, rows }
}

function pickRow<T>(rows: T[], preferred: string | undefined, read: (row: T) => string): T | null {
  if (preferred) {
    const found = rows.find((row) => read(row) === preferred)
    if (found) return found
  }
  return rows.length === 1 ? rows[0] : null
}

async function connectionFor(professionalId: string) {
  const { data } = await serviceClient()
    .from('schedule_connections')
    .select('id, status, external_resource_id, is_source')
    .eq('professional_id', professionalId)
    .eq('provider', 'square')
    .maybeSingle()
  return data
}

async function ensureConnection(professionalId: string) {
  const existing = await connectionFor(professionalId)
  if (existing) return existing
  const { data, error } = await serviceClient()
    .from('schedule_connections')
    .insert({ professional_id: professionalId, provider: 'square', status: 'pending', is_source: false })
    .select('id, status, external_resource_id, is_source')
    .single()
  if (error || !data) return null
  return data
}

export async function grantSquare(input: {
  professionalId: string
  environment: SquareEnvironment
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  merchantId?: string
  locationId?: string
  teamMemberId?: string
  serviceVariationId?: string
  obtainedVia: 'oauth' | 'paste'
}): Promise<
  | { kind: 'connected'; status: string; location: SquareChoice['locations'][number]; member: SquareChoice['members'][number]; service: SquareChoice['services'][number] }
  | { kind: 'choose'; choice: SquareChoice }
  | { kind: 'incomplete' }
  | { kind: 'rejected'; error: string }
> {
  const found = await discoverSquare(input.environment, input.accessToken)
  if (!found.ok && found.status === 401) return { kind: 'rejected', error: found.error }
  const connection = await ensureConnection(input.professionalId)
  if (!connection) return { kind: 'rejected', error: 'Could not save the Square connection.' }
  const previous = await readStored(connection.id)
  if (!found.ok) {
    await writeStored(connection.id, {
      ...(previous ?? {}),
      environment: input.environment,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? previous?.refreshToken,
      expiresAt: input.expiresAt ?? previous?.expiresAt,
      refreshedAt: new Date().toISOString(),
      merchantId: input.merchantId ?? previous?.merchantId,
      obtainedVia: input.obtainedVia === 'paste' && previous?.obtainedVia === 'oauth' ? 'oauth' : input.obtainedVia,
      revoked: false,
    })
    return { kind: 'incomplete' }
  }
  const location = pickRow(found.choice.locations, input.locationId ?? previous?.locationId, (row) => row.id)
  const member = pickRow(found.choice.members, input.teamMemberId ?? previous?.teamMemberId, (row) => row.id)
  const service = pickRow(
    found.choice.services,
    input.serviceVariationId ?? previous?.serviceVariationId ?? connection.external_resource_id ?? undefined,
    (row) => row.variationId,
  )
  const keepOauth = input.obtainedVia === 'paste'
    && previous?.obtainedVia === 'oauth'
    && previous.accessToken === input.accessToken
    && Boolean(previous.refreshToken)
  const base: SquareStored = {
    environment: input.environment,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? (keepOauth || input.obtainedVia === 'oauth' ? previous?.refreshToken : undefined),
    expiresAt: input.expiresAt ?? (keepOauth ? previous?.expiresAt : undefined),
    refreshedAt: new Date().toISOString(),
    merchantId: input.merchantId ?? (keepOauth ? previous?.merchantId : undefined),
    obtainedVia: keepOauth ? 'oauth' : input.obtainedVia,
    revoked: false,
    locationId: location?.id,
    teamMemberId: member?.id,
    serviceVariationId: service?.variationId,
  }
  if (!location || !member || !service) {
    await writeStored(connection.id, base)
    if (connection.is_source) {
      const admin = serviceClient()
      await admin.from('schedule_connections').update({ is_source: false }).eq('id', connection.id)
      await admin.from('professionals').update({ schedule_mode: null }).eq('id', input.professionalId).eq('schedule_mode', 'external')
    }
    return { kind: 'choose', choice: found.choice }
  }
  const status = connection.status === 'tested' && connection.external_resource_id === service.variationId ? 'tested' : 'pending'
  const admin = serviceClient()
  await admin.from('schedule_connections').update({ is_source: false }).eq('professional_id', input.professionalId).neq('provider', 'square')
  const { error } = await admin.from('schedule_connections').update({
    external_resource_id: service.variationId,
    is_source: true,
    status,
  }).eq('id', connection.id)
  if (error) return { kind: 'rejected', error: error.message }
  const secretError = await writeStored(connection.id, base)
  if (secretError) return { kind: 'rejected', error: secretError }
  const { error: modeError } = await admin.from('professionals').update({
    schedule_mode: 'external',
    schedule_prompt_dismissed: true,
  }).eq('id', input.professionalId)
  if (modeError) return { kind: 'rejected', error: modeError.message }
  return { kind: 'connected', status, location, member, service }
}

export async function disconnectSquare(professionalId: string): Promise<{ ok: true; revoked: boolean }> {
  const connection = await connectionFor(professionalId)
  if (!connection) return { ok: true, revoked: false }
  const stored = await readStored(connection.id)
  let revoked = false
  if (stored?.obtainedVia === 'oauth' && stored.accessToken && !stored.revoked) {
    const creds = squareCredentials(stored.environment)
    const host = squareHost(stored.environment)
    if (creds && host) {
      const response = await fetch(`${host}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          authorization: `Client ${creds.secret}`,
          accept: 'application/json',
          'content-type': 'application/json',
          'Square-Version': SQUARE_VERSION,
        },
        body: JSON.stringify(stored.merchantId
          ? { client_id: creds.id, merchant_id: stored.merchantId }
          : { client_id: creds.id, access_token: stored.accessToken }),
      })
      const payload = await response.json().catch(() => null)
      revoked = response.ok && payload?.success === true
    }
  }
  if (stored) {
    await writeStored(connection.id, { environment: stored.environment, obtainedVia: stored.obtainedVia, revoked: true })
  }
  const admin = serviceClient()
  if (connection.is_source) {
    await admin.from('schedule_connections').update({ is_source: false }).eq('id', connection.id)
    await admin.from('professionals').update({ schedule_mode: null }).eq('id', professionalId).eq('schedule_mode', 'external')
  }
  return { ok: true, revoked }
}

export async function squareAccountStatus(professionalId: string) {
  const connection = await connectionFor(professionalId)
  const stored = connection ? await readStored(connection.id) : null
  const bookable = Boolean(bookingSecret(stored, connection?.external_resource_id))
  return {
    connected: Boolean(connection?.is_source && bookable && !stored?.revoked),
    pendingChoice: Boolean(stored?.accessToken && !stored.revoked && !bookable),
    via: stored?.obtainedVia ?? null,
    environment: stored?.environment ?? null,
    expiresAt: stored?.obtainedVia === 'oauth' ? stored.expiresAt ?? null : null,
    status: connection?.status ?? null,
    isSource: Boolean(connection?.is_source),
    revoked: Boolean(stored?.revoked),
    homologated: false,
  }
}

export async function refreshDueSquareTokens() {
  const { data } = await serviceClient().from('schedule_connections').select('id').eq('provider', 'square')
  const rows = data ?? []
  let refreshed = 0
  let skipped = 0
  let failed = 0
  for (const row of rows) {
    const stored = await readStored(row.id)
    const secret = bookingSecret(stored, stored?.serviceVariationId)
    if (!secret?.refreshToken) {
      skipped += 1
      continue
    }
    if (!shouldRefreshSquareToken(secret)) {
      skipped += 1
      continue
    }
    const before = secret.refreshedAt
    const next = await ensureFreshSquare(row.id, secret)
    if ('expired' in next || next.refreshedAt === before) failed += 1
    else refreshed += 1
  }
  return { checked: rows.length, refreshed, skipped, failed }
}

export async function exchangeSquareCode(environment: SquareEnvironment, code: string) {
  const creds = squareCredentials(environment)
  if (!creds) return { ok: false as const, error: 'Square sign-in is not configured yet.' }
  const exchanged = await obtainToken(environment, {
    client_id: creds.id,
    client_secret: creds.secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: 'https://otddminugslmacdirual.supabase.co/functions/v1/scheduling-square-oauth',
  })
  const accessToken = exchanged.body?.access_token
  const refreshToken = exchanged.body?.refresh_token
  if (!exchanged.ok || typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return { ok: false as const, error: 'Square did not finish sign-in.' }
  }
  return {
    ok: true as const,
    accessToken,
    refreshToken,
    expiresAt: typeof exchanged.body?.expires_at === 'string' ? exchanged.body.expires_at : undefined,
    merchantId: typeof exchanged.body?.merchant_id === 'string' ? exchanged.body.merchant_id : undefined,
  }
}
