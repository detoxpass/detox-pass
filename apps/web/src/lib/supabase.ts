import type { Role } from '../shell/nav'

declare const __SUPABASE_URL__: string
declare const __SUPABASE_PUBLISHABLE_KEY__: string

const url = __SUPABASE_URL__
const key = __SUPABASE_PUBLISHABLE_KEY__

export const supabaseConfigured = Boolean(url && key)
const storageKey = 'detox-pass-session'

export type SessionUser = {
  id: string
  email?: string
  app_metadata?: { role?: string }
}

export type Session = {
  access_token: string
  refresh_token: string
  expires_at: number
  user: SessionUser
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: SessionUser
  error_description?: string
  msg?: string
  error?: string
}

export function roleOf(session: Session): Role {
  const role = session.user.app_metadata?.role
  if (role === 'profissional') return 'therapist'
  if (role === 'operacao') return 'admin'
  return 'client'
}

export function displayName(session: Session) {
  return session.user.email?.split('@')[0] ?? 'Conta'
}

function save(session: Session | null) {
  if (!session) localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, JSON.stringify(session))
}

function read(): Session | null {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

function fromToken(body: TokenResponse): Session {
  if (!body.access_token || !body.refresh_token || !body.user) {
    throw new Error(body.error_description || body.msg || body.error || 'Sign in failed.')
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: body.user,
  }
}

async function readBody(response: Response) {
  const text = await response.text()
  try {
    return JSON.parse(text) as TokenResponse
  } catch {
    throw new Error('Sign in did not reach Supabase. Check SUPABASE_URL on the deploy.')
  }
}

async function token(grant: string, payload: Record<string, string>) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const response = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await readBody(response)
  if (!response.ok) throw new Error(body.error_description || body.msg || body.error || 'Sign in failed.')
  return fromToken(body)
}

export async function loadSession() {
  const current = read()
  if (!current) return null
  if (current.expires_at > Math.floor(Date.now() / 1000) + 30) return current
  try {
    const next = await token('refresh_token', { refresh_token: current.refresh_token })
    save(next)
    return next
  } catch {
    save(null)
    return null
  }
}

export async function signIn(email: string, password: string) {
  const session = await token('password', { email, password })
  save(session)
  return session
}

export function authRedirect() {
  return `${window.location.origin}/auth/callback`
}

export async function signUp(email: string, password: string) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const endpoint = new URL(`${url}/auth/v1/signup`)
  endpoint.searchParams.set('redirect_to', authRedirect())
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await readBody(response)
  if (!response.ok) throw new Error(body.error_description || body.msg || body.error || 'Could not create the account.')
  if (body.access_token && body.refresh_token && body.user) {
    const session = fromToken(body)
    save(session)
    return { session, confirm: false }
  }
  return { session: null, confirm: true }
}

export type PartnerApplication = {
  full_name: string
  email: string
  password: string
  birth_date: string
  gender: string
  phone: string
  bio: string
  address_line: string
  postal_code: string
  city_name: string
  region: string
  instagram: string
  specialty_note: string
  coverage_note: string
  terms: boolean
}

export async function applyPartner(application: PartnerApplication) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const response = await fetch(`${url}/functions/v1/partner-apply`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(application),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not send the application.')
}

export async function recover(email: string) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const response = await fetch(`${url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: authRedirect() }),
  })
  if (!response.ok) {
    const body = await readBody(response)
    throw new Error(body.error_description || body.msg || 'Could not send the recovery email.')
  }
}

export type AccountProfile = {
  full_name: string | null
  role: string
  avatar_path: string | null
  created_at: string
  updated_at: string
}

function authHeaders(session: Session, extra?: Record<string, string>) {
  return {
    apikey: key,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('The server did not return JSON.')
  }
}

function messageOf(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const record = body as { message?: string; error_description?: string; msg?: string; error?: string }
  return record.message || record.error_description || record.msg || record.error || ''
}

export function avatarUrl(path: string | null, version?: string) {
  if (!path) return ''
  const stamp = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${url}/storage/v1/object/public/avatars/${path}${stamp}`
}

export async function loadProfile(session: Session) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=full_name,role,avatar_path,created_at,updated_at`, {
    headers: authHeaders(session),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not load the profile.')
  const row = Array.isArray(body) ? body[0] as AccountProfile | undefined : null
  if (!row) throw new Error('This account has no profile yet.')
  return row
}

export async function saveProfile(session: Session, fullName: string) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
    method: 'PATCH',
    headers: authHeaders(session, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ full_name: fullName.trim() || null }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not save the profile.')
  const row = Array.isArray(body) ? body[0] as AccountProfile | undefined : null
  if (!row) throw new Error('Could not save the profile.')
  return row
}

export async function uploadAvatar(session: Session, file: Blob) {
  const path = `${session.user.id}/photo.jpg`
  const response = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
    method: 'POST',
    headers: authHeaders(session, {
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
      'cache-control': '3600',
    }),
    body: file,
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not upload the photo.')
  return saveProfilePhoto(session, path)
}

async function saveProfilePhoto(session: Session, path: string) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
    method: 'PATCH',
    headers: authHeaders(session, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ avatar_path: path }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not save the photo.')
  const row = Array.isArray(body) ? body[0] as AccountProfile | undefined : null
  if (!row) throw new Error('Could not save the photo.')
  return row
}

export async function updateEmail(session: Session, email: string) {
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not update the email.')
}

export async function changePassword(session: Session, email: string, current: string, next: string) {
  const fresh = await signIn(email, current)
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: authHeaders(fresh, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password: next }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not update the password.')
  return signIn(email, next)
}

export async function deleteOwnAccount(session: Session) {
  const response = await fetch(`${url}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: '{}',
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new Error(messageOf(body) || 'Could not delete the account.')
  }
  signOut()
}

export function signOut() {
  const current = read()
  save(null)
  if (!current) return
  void fetch(`${url}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${current.access_token}` },
  })
}

export async function catalog(session: Session) {
  const select = [
    'id',
    'display_name',
    'portrait_path',
    'schedule_mode',
    'professional_services(service_id,services(id,name,price_cents,currency))',
    'professional_cities(city_id,cities(id,name))',
    'schedule_connections(provider,is_source)',
  ].join(',')
  const response = await fetch(`${url}/rest/v1/professionals?select=${encodeURIComponent(select)}&active=eq.true&order=display_name.asc`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  if (!response.ok) throw new Error('Could not load the catalog.')
  const body = await readBody(response)
  return body as unknown as ProfessionalRow[]
}

export type ProfessionalRow = {
  id: string
  display_name: string
  portrait_path: string | null
  schedule_mode: 'internal' | 'external' | null
  professional_services: { service_id: string; services: { id: string; name: string; price_cents: number | null; currency: string | null } | null }[] | null
  professional_cities: { city_id: string; cities: { id: string; name: string } | null }[] | null
  schedule_connections: { provider: string; is_source: boolean }[] | null
}

export function calendarDoor(provider: string | null | undefined): string | null {
  if (provider === 'internal') return 'scheduling-internal'
  if (provider === 'acuity' || provider === 'square') return `scheduling-${provider}`
  return null
}

export async function completeAuthCallback() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const access = hash.get('access_token')
  const refresh = hash.get('refresh_token')
  if (access && refresh) {
    const session = await sessionFromAccess(access, refresh, Number(hash.get('expires_in') || 3600))
    save(session)
    window.history.replaceState(null, '', '/auth/callback')
    return session
  }
  const tokenHash = query.get('token_hash')
  const type = query.get('type')
  if (!tokenHash || !type) throw new Error('This link is invalid or expired.')
  const response = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_hash: tokenHash, type }),
  })
  const body = await readBody(response)
  if (!response.ok) throw new Error(body.error_description || body.msg || body.error || 'This link is invalid or expired.')
  const session = fromToken(body)
  save(session)
  window.history.replaceState(null, '', '/auth/callback')
  return session
}

async function sessionFromAccess(access: string, refresh: string, expiresIn: number) {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${access}` },
  })
  const body = await readJson(response)
  if (!response.ok || !body || typeof body !== 'object') throw new Error('This link is invalid or expired.')
  return fromToken({
    access_token: access,
    refresh_token: refresh,
    expires_in: expiresIn,
    user: body as SessionUser,
  })
}

export async function callFunction(session: Session, name: string, payload: Record<string, unknown>) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  const body = await readJson(response)
  if (!response.ok && response.status !== 422) throw new Error(messageOf(body) || 'The request failed.')
  return { status: response.status, body }
}

async function rest(session: Session, path: string, init?: RequestInit) {
  const extra: Record<string, string> = { 'Content-Type': 'application/json', Prefer: 'return=representation' }
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: authHeaders(session, extra),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not save.')
  return body
}

export type AccountRow = { id: string; email: string; full_name: string | null; role: string }

export async function listAccounts(session: Session) {
  const response = await fetch(`${url}/rest/v1/rpc/list_accounts`, {
    method: 'POST',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: '{}',
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not load accounts.')
  return (Array.isArray(body) ? body : []) as AccountRow[]
}

export async function setAppRole(session: Session, userId: string, role: string) {
  const result = await callFunction(session, 'commands', { action: 'set_app_role', user_id: userId, role })
  if (result.status >= 400) throw new Error(messageOf(result.body) || 'Could not change the role.')
}

export const portraits = [
  '/people/alex.jpg',
  '/people/arena.jpg',
  '/people/fresh.jpg',
  '/people/hale.jpg',
  '/people/jacob.jpg',
  '/people/merrill.jpg',
  '/people/naomi.jpg',
  '/people/nathana.jpg',
  '/people/sparkle.jpg',
  '/people/splash.jpg',
  '/people/surgical.jpg',
]

export type CatalogService = { id: string; name: string; slug: string; price_cents: number | null; currency: string | null }
export type CatalogCity = { id: string; name: string; slug: string }
export type CatalogSpecialty = { id: string; name: string; slug: string }

async function rows<T>(session: Session, path: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: authHeaders(session) })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not load this list.')
  return (Array.isArray(body) ? body : []) as T[]
}

export function loadServices(session: Session) {
  return rows<CatalogService>(session, 'services?select=id,name,slug,price_cents,currency&order=name.asc')
}
export function loadCities(session: Session) {
  return rows<CatalogCity>(session, 'cities?select=id,name,slug&order=name.asc')
}
export function loadSpecialties(session: Session) {
  return rows<CatalogSpecialty>(session, 'specialties?select=id,name,slug&order=name.asc')
}

export type AdminProfessional = {
  id: string
  profile_id: string
  display_name: string
  active: boolean
  portrait_path: string | null
  professional_services: { service_id: string }[] | null
  professional_cities: { city_id: string }[] | null
  professional_specialties: { specialty_id: string }[] | null
  schedule_connections: { id: string; provider: string; external_resource_id: string | null; status: string }[] | null
}

export function loadAdminProfessionals(session: Session) {
  const select = 'id,profile_id,display_name,active,portrait_path,professional_services(service_id),professional_cities(city_id),professional_specialties(specialty_id),schedule_connections(id,provider,external_resource_id,status)'
  return rows<AdminProfessional>(session, `professionals?select=${encodeURIComponent(select)}&order=display_name.asc`)
}

export async function insertRow(session: Session, table: string, payload: Record<string, unknown>) {
  const body = await rest(session, table, { method: 'POST', body: JSON.stringify(payload) })
  if (!Array.isArray(body) || body.length === 0) throw new Error('Nothing was saved.')
  return body[0] as { id: string }
}

export async function patchRow(session: Session, table: string, id: string, payload: Record<string, unknown>) {
  const body = await rest(session, `${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
  if (!Array.isArray(body) || body.length === 0) throw new Error('Nothing was saved.')
}

export async function replaceLinks(session: Session, table: string, column: string, professionalId: string, ids: string[]) {
  const clear = await fetch(`${url}/rest/v1/${table}?professional_id=eq.${encodeURIComponent(professionalId)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
  if (!clear.ok) {
    const body = await readJson(clear)
    throw new Error(messageOf(body) || 'Could not update the links.')
  }
  if (ids.length === 0) return
  await rest(session, table, {
    method: 'POST',
    body: JSON.stringify(ids.map((id) => ({ professional_id: professionalId, [column]: id }))),
  })
}

export async function setScheduleChoice(session: Session, mode: 'internal' | 'external' | null, dismiss: boolean) {
  const response = await fetch(`${url}/rest/v1/rpc/set_my_schedule_choice`, {
    method: 'POST',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_mode: mode, p_dismiss: dismiss }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not save the calendar choice.')
}

export async function setScheduleGrid(session: Session, timezone: string, slotMinutes: number) {
  const response = await fetch(`${url}/rest/v1/rpc/set_my_schedule_grid`, {
    method: 'POST',
    headers: authHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_timezone: timezone, p_slot_minutes: slotMinutes }),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(messageOf(body) || 'Could not save the calendar settings.')
}

export type MySchedule = {
  id: string
  schedule_mode: 'internal' | 'external' | null
  schedule_prompt_dismissed: boolean
  schedule_timezone: string
  slot_minutes: number
  active: boolean
  display_name: string
  schedule_connections?: { provider: string; is_source: boolean; status: string }[] | null
}

export function loadMySchedule(session: Session) {
  return rows<MySchedule>(session, `professionals?select=id,schedule_mode,schedule_prompt_dismissed,schedule_timezone,slot_minutes,active,display_name,schedule_connections(provider,is_source,status)&profile_id=eq.${encodeURIComponent(session.user.id)}`)
}

export type HourWindow = { id: string; weekday: number; start_minute: number; end_minute: number }
export type TimeBlock = { id: string; starts_at: string; ends_at: string }

export function loadHours(session: Session, professionalId: string) {
  return rows<HourWindow>(session, `professional_hours?select=id,weekday,start_minute,end_minute&professional_id=eq.${encodeURIComponent(professionalId)}&order=weekday.asc,start_minute.asc`)
}

export function loadBlocks(session: Session, professionalId: string) {
  return rows<TimeBlock>(session, `professional_blocks?select=id,starts_at,ends_at&professional_id=eq.${encodeURIComponent(professionalId)}&order=starts_at.asc`)
}

export async function replaceHours(session: Session, professionalId: string, windows: { weekday: number; start_minute: number; end_minute: number }[]) {
  const clear = await fetch(`${url}/rest/v1/professional_hours?professional_id=eq.${encodeURIComponent(professionalId)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
  if (!clear.ok) {
    const body = await readJson(clear)
    throw new Error(messageOf(body) || 'Could not update the weekly hours.')
  }
  if (windows.length === 0) return
  await rest(session, 'professional_hours', {
    method: 'POST',
    body: JSON.stringify(windows.map((window) => ({ professional_id: professionalId, ...window }))),
  })
}

export async function addBlock(session: Session, professionalId: string, startsAt: string, endsAt: string) {
  await rest(session, 'professional_blocks', {
    method: 'POST',
    body: JSON.stringify({ professional_id: professionalId, starts_at: startsAt, ends_at: endsAt }),
  })
}

export async function removeBlock(session: Session, id: string) {
  const response = await fetch(`${url}/rest/v1/professional_blocks?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new Error(messageOf(body) || 'Could not remove the block.')
  }
}

export type BookingRow = {
  id: string
  professional_id: string
  starts_at: string
  saga_status: string
  external_booking_id: string | null
  amount_cents: number | null
  services: { name: string } | null
  professionals: { display_name: string } | null
  cities: { name: string } | null
  provider: string
}

export function loadBookings(session: Session) {
  const select = 'id,professional_id,starts_at,saga_status,external_booking_id,amount_cents,provider,services(name),professionals(display_name),cities(name)'
  return rows<BookingRow>(session, `bookings?select=${encodeURIComponent(select)}&order=starts_at.desc`)
}

export type BookingEvent = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  from_starts_at: string | null
  to_starts_at: string | null
  origin: string | null
  created_at: string
}

export type ChatBlock = { type: string; text?: string; [key: string]: unknown }

export type ChatMessage = {
  id: string
  thread_id: string
  role: 'user' | 'assistant'
  body: string
  blocks: ChatBlock[]
  from_audio: boolean
  created_at: string
}

export async function loadChat(session: Session) {
  const threads = await rows<{ id: string }>(session, 'chat_threads?select=id&order=created_at.desc&limit=1')
  const threadId = threads[0]?.id ?? ''
  if (!threadId) return { threadId, messages: [] as ChatMessage[] }
  const messages = await rows<ChatMessage>(session, `chat_messages?select=id,thread_id,role,body,blocks,from_audio,created_at&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc`)
  return { threadId, messages }
}

export function postChat(session: Session, payload: Record<string, unknown>) {
  return callFunction(session, 'chat', payload)
}

export function loadBookingEvents(session: Session, bookingId: string) {
  return rows<BookingEvent>(session, `booking_events?select=id,event_type,from_status,to_status,from_starts_at,to_starts_at,origin,created_at&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.asc`)
}

export type Notice = {
  id: string
  audience: string
  kind: string
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

export function loadNotices(session: Session) {
  return rows<Notice>(session, 'notifications?select=id,audience,kind,title,body,href,read_at,created_at&order=created_at.desc')
}

export async function loadUnreadCount(session: Session) {
  const items = await rows<{ id: string }>(session, 'notifications?select=id&read_at=is.null')
  return items.length
}

export async function markNoticesRead(session: Session, id?: string) {
  const filter = id ? `id=eq.${encodeURIComponent(id)}` : 'read_at=is.null'
  const response = await fetch(`${url}/rest/v1/notifications?${filter}`, {
    method: 'PATCH',
    headers: authHeaders(session, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new Error(messageOf(body) || 'Could not update the notification.')
  }
}
