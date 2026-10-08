import { appRole, json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'
import { createGustoContractor } from '../_shared/gusto/contractor.ts'
import { exchangeClientCredentials } from '../_shared/gusto/client.ts'
import { sanitizeText } from '../_shared/gusto/sanitize.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405)

  const auth = await requireUser(req)
  if (auth.error) return auth.error

  let body: { professional_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  const professionalId = await allowedProfessional(auth.user.id, appRole(auth.user), body.professional_id)
  if (typeof professionalId !== 'string') return professionalId

  const service = serviceClient()
  const { data: professional, error } = await service
    .from('professionals')
    .select('id, profile_id, display_name')
    .eq('id', professionalId)
    .maybeSingle()
  if (error) return json({ status: 'invalid', message: 'Could not load the professional.' }, 400)
  if (!professional) return json({ status: 'missing', message: 'Professional is missing' }, 404)

  const { data: profile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', professional.profile_id)
    .maybeSingle()
  const account = await service.auth.admin.getUserById(professional.profile_id)
  const [firstName, ...rest] = (profile?.full_name || professional.display_name || '').trim().split(/\s+/)
  const { data: contractorUuid } = await service.rpc('gusto_contractor_link', { p_professional_id: professionalId })

  const result = await createGustoContractor({
    id: professional.id,
    firstName: firstName || '',
    lastName: rest.join(' '),
    email: account.data.user?.email || '',
    contractorUuid: typeof contractorUuid === 'string' ? contractorUuid : null,
  }, (await exchangeClientCredentials()).data?.accessToken)

  if (result.status === 'synced' && result.data?.contractorUuid) {
    const saved = await service.rpc('record_gusto_contractor', {
      p_professional_id: professionalId,
      p_contractor_uuid: result.data.contractorUuid,
    })
    if (saved.error) return json({ status: 'invalid', message: 'Could not save the payment profile.' }, 400)
  } else if (result.persistError) {
    await service.rpc('record_gusto_sync_error', {
      p_professional_id: professionalId,
      p_error: sanitizeText(result.message),
    })
  }

  return json({ status: result.status, message: publicMessage(result.status, result.message) }, result.ok ? 200 : 400)
})

function publicMessage(status: string, message: string) {
  if (status === 'not_configured') return 'Gusto integration is not configured'
  if (status === 'already_synced') return 'Payment profile already exists'
  if (status === 'synced') return 'Payment profile saved'
  return sanitizeText(message)
}

async function allowedProfessional(userId: string, role: string, requested: string | undefined): Promise<string | Response> {
  if (role === 'operacao') {
    if (!requested || !UUID.test(requested)) return json({ error: 'professional_id inválido' }, 400)
    return requested
  }
  if (role !== 'profissional') return json({ error: 'sem permissão' }, 403)
  const { data, error } = await serviceClient()
    .from('professionals')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle()
  if (error || !data) return json({ error: 'profissional inexistente' }, 404)
  if (requested && requested !== data.id) return json({ error: 'sem permissão' }, 403)
  return data.id
}
