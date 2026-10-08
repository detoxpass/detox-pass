import { gustoConfig, gustoReady } from './config.ts'
import { gustoRequest, invalid, notConfigured, type GustoResult } from './client.ts'

export type ProfessionalSnapshot = {
  id: string
  firstName: string
  lastName: string
  email: string
  contractorUuid: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function contractorKey(professionalId: string) {
  return `detox-contractor-${professionalId}`
}

export async function createGustoContractor(
  professional: ProfessionalSnapshot,
  accessToken?: string,
): Promise<GustoResult<{ contractorUuid: string }>> {
  if (!UUID.test(professional.id)) return invalid('Professional is missing')
  if (professional.contractorUuid) {
    return {
      ok: true,
      status: 'already_synced',
      message: 'Contractor already exists',
      data: { contractorUuid: professional.contractorUuid },
    }
  }
  if (!gustoReady() || !accessToken) return notConfigured()
  if (!professional.firstName || !professional.lastName || !professional.email) {
    return invalid('Professional name and email are required')
  }

  const result = await gustoRequest({
    method: 'POST',
    path: `/v1/companies/${gustoConfig().companyUuid}/contractors`,
    idempotencyKey: contractorKey(professional.id),
    accessToken,
    body: {
      type: 'Individual',
      wage_type: 'Fixed',
      start_date: new Date().toISOString().slice(0, 10),
      first_name: professional.firstName,
      last_name: professional.lastName,
      email: professional.email,
      self_onboarding: false,
    },
  })
  if (!result.ok || result.status !== 'synced') return result
  const uuid = contractorUuidOf(result.data?.body)
  if (!uuid) return invalid('Gusto did not return a contractor')
  return { ok: true, status: 'synced', message: 'ok', data: { contractorUuid: uuid } }
}

function contractorUuidOf(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('uuid' in body)) return null
  const uuid = (body as { uuid?: unknown }).uuid
  return typeof uuid === 'string' && UUID.test(uuid) ? uuid : null
}
