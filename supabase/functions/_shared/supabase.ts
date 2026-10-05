import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export type { SupabaseClient }

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders })
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
  })
}

export function appRole(user: { app_metadata?: Record<string, unknown> | null }): string {
  const role = user.app_metadata?.role
  return typeof role === 'string' ? role : ''
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = req.headers.get('Authorization')
  if (!url || !key || !authorization) {
    throw new Error('sessão do usuário ausente')
  }
  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
}

type Authed = { client: SupabaseClient; user: User; error: null }
type Anonymous = { client: null; user: null; error: Response }

export async function requireUser(req: Request): Promise<Authed | Anonymous> {
  let client: SupabaseClient
  try {
    client = userClient(req)
  } catch {
    return { client: null, user: null, error: json({ error: 'não autenticado' }, 401) }
  }

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    return { client: null, user: null, error: json({ error: 'não autenticado' }, 401) }
  }
  return { client, user: data.user, error: null }
}
