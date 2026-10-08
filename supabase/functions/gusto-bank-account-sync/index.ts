import { appRole, json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'
import { syncGustoBankAccount, type BankAccountInput } from '../_shared/gusto/bank.ts'
import { exchangeClientCredentials } from '../_shared/gusto/client.ts'
import { sanitizeText } from '../_shared/gusto/sanitize.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Body = {
  professional_id?: string
  name?: string
  routing_number?: string
  account_number?: string
  account_type?: string
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

  const professionalId = await allowedProfessional(auth.user.id, appRole(auth.user), body.professional_id)
  if (typeof professionalId !== 'string') return professionalId

  const bank: BankAccountInput = {
    name: body.name ?? '',
    routingNumber: body.routing_number ?? '',
    accountNumber: body.account_number ?? '',
    accountType: body.account_type === 'Savings' ? 'Savings' : 'Checking',
  }
  const service = serviceClient()
  const { data: contractorUuid } = await service.rpc('gusto_contractor_link', { p_professional_id: professionalId })
  const result = await syncGustoBankAccount({
    professionalId,
    contractorUuid: typeof contractorUuid === 'string' ? contractorUuid : null,
    bank,
    accessToken: (await exchangeClientCredentials()).data?.accessToken,
  })

  if (result.status === 'synced' && result.data?.bankAccountDisplay) {
    const saved = await service.rpc('record_gusto_bank_display', {
      p_professional_id: professionalId,
      p_display: result.data.bankAccountDisplay,
    })
    if (saved.error) return json({ status: 'invalid', message: 'Could not save the payment profile.' }, 400)
  } else if (result.persistError) {
    await service.rpc('record_gusto_sync_error', {
      p_professional_id: professionalId,
      p_error: sanitizeText(result.message),
    })
  }

  return json({
    status: result.status,
    message: result.status === 'not_configured' ? 'Gusto integration is not configured' : sanitizeText(result.message),
    bank_account_display: result.data?.bankAccountDisplay ?? null,
  }, result.ok ? 200 : 400)
})

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
