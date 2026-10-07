import { serviceClient } from '../_shared/supabase.ts'
import {
  appointmentChoices,
  normalizePem,
  readWixState,
  verifyInstallProof,
  wixReturnUrl,
} from '../_shared/wix.ts'

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Use GET', { status: 405, headers: { 'cache-control': 'no-store' } })
  }
  const incoming = new URL(req.url)
  const stateSecret = Deno.env.get('WIX_OAUTH_STATE_SECRET')?.trim() ?? ''
  const state = await readWixState(stateSecret, incoming.searchParams.get('state') ?? '')
  const back = (result: string) => wixReturnUrl(state?.surface ?? 'agenda', state?.professionalId ?? '', result)
  if (!state) return page(back('error'))
  if (incoming.searchParams.get('error')) return page(back('denied'))

  const instanceId = incoming.searchParams.get('instanceId')?.trim() ?? ''
  const signedInstance = incoming.searchParams.get('signedInstance')?.trim() ?? ''
  const app = await appCredentials()
  if (!app || !signedInstance) return page(back('error'))
  const proved = await verifyInstallProof({
    appSecret: app.appSecret,
    publicKeyPem: app.publicKeyPem,
    signedInstance,
    instanceId,
  })
  if (!proved) return page(back('error'))

  const saved = await storeInstance(state.professionalId, {
    appId: app.appId,
    appSecret: app.appSecret,
    instanceId,
    publicKeyPem: app.publicKeyPem,
  })
  if (!saved) return page(back('error'))
  const services = await servicesFor(saved.token)
  const only = services.length === 1 ? services[0] : null
  if (only && saved.connectionId) {
    await saveOnlyService(state.professionalId, saved.connectionId, only.id)
    return page(back('connected'))
  }
  return page(back(services.length > 1 ? 'choose' : 'error'))
})

function page(location: string) {
  const safe = JSON.stringify(location)
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Detox Pass</title><p>Returning to Detox Pass.</p><p><a href=${safe}>Continue</a></p><script>location.replace(${safe})</script>`
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function appCredentials() {
  const appId = Deno.env.get('WIX_APP_ID')?.trim() ?? ''
  const appSecret = Deno.env.get('WIX_APP_SECRET')?.trim() ?? ''
  const publicKeyPem = normalizePem(Deno.env.get('WIX_WEBHOOK_PUBLIC_KEY') ?? '')
  if (appId && appSecret && publicKeyPem.includes('BEGIN PUBLIC KEY')) {
    return { appId, appSecret, publicKeyPem }
  }
  const { data } = await serviceClient().from('schedule_connections').select('id').eq('provider', 'wix')
  for (const row of data ?? []) {
    const { data: secret } = await serviceClient().rpc('read_calendar_secret', { p_connection_id: row.id })
    if (typeof secret !== 'string') continue
    try {
      const parsed = JSON.parse(secret) as { appId?: string; appSecret?: string; publicKeyPem?: string }
      const pem = normalizePem(parsed.publicKeyPem ?? '')
      if (parsed.appId && parsed.appSecret && pem.includes('BEGIN PUBLIC KEY')) {
        return { appId: parsed.appId, appSecret: parsed.appSecret, publicKeyPem: pem }
      }
    } catch {
      continue
    }
  }
  return null
}

async function storeInstance(professionalId: string, secret: {
  appId: string
  appSecret: string
  instanceId: string
  publicKeyPem: string
}) {
  const admin = serviceClient()
  const { data: existing } = await admin
    .from('schedule_connections')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('provider', 'wix')
    .maybeSingle()
  let connectionId = existing?.id as string | undefined
  if (!connectionId) {
    const { data, error } = await admin.from('schedule_connections').insert({
      professional_id: professionalId,
      provider: 'wix',
      status: 'pending',
      is_source: false,
    }).select('id').single()
    if (error || !data) return null
    connectionId = data.id
  }
  const token = await accessToken(secret)
  if (!token) return null
  const { error } = await admin.rpc('store_calendar_secret', {
    p_connection_id: connectionId,
    p_token: JSON.stringify(secret),
  })
  if (error) return null
  return { connectionId, token }
}

async function saveOnlyService(professionalId: string, connectionId: string, serviceId: string) {
  const admin = serviceClient()
  const { data: otherSource } = await admin
    .from('schedule_connections')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('is_source', true)
    .neq('provider', 'wix')
    .maybeSingle()
  await admin.from('schedule_connections').update({
    external_resource_id: serviceId,
    status: 'pending',
    is_source: !otherSource,
  }).eq('id', connectionId)
  if (!otherSource) {
    await admin.from('professionals').update({
      schedule_mode: 'external',
      schedule_prompt_dismissed: true,
    }).eq('id', professionalId)
  }
}

async function servicesFor(token: string) {
  const response = await fetch('https://www.wixapis.com/bookings/v2/services/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { paging: { limit: 50 } } }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return []
  return appointmentChoices(payload)
}

async function accessToken(secret: { appId: string; appSecret: string; instanceId: string }) {
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
  const token = payload && typeof payload === 'object' && 'access_token' in payload ? payload.access_token : ''
  return response.ok && typeof token === 'string' ? token : ''
}
