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

export async function signUp(email: string, password: string) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const response = await fetch(`${url}/auth/v1/signup`, {
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

export async function recover(email: string) {
  if (!supabaseConfigured) throw new Error('This deploy is missing the Supabase environment variables.')
  const response = await fetch(`${url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) {
    const body = await readBody(response)
    throw new Error(body.error_description || body.msg || 'Could not send the recovery email.')
  }
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
    'professional_services(services(name,price_cents,currency))',
    'professional_cities(cities(name))',
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
  professional_services: { services: { name: string; price_cents: number | null; currency: string | null } | null }[] | null
  professional_cities: { cities: { name: string } | null }[] | null
}
