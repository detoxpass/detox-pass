import { gustoReady } from './config.ts'
import { gustoRequest, invalid, notConfigured, type GustoResult } from './client.ts'

export type BankAccountInput = {
  name: string
  routingNumber: string
  accountNumber: string
  accountType: 'Checking' | 'Savings'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function maskedAccount(accountNumber: string): string | null {
  const digits = accountNumber.replace(/\D/g, '')
  if (digits.length < 4) return null
  return `••••${digits.slice(-4)}`
}

export async function syncGustoBankAccount(input: {
  professionalId: string
  contractorUuid: string | null
  bank: BankAccountInput
  accessToken?: string
}): Promise<GustoResult<{ bankAccountDisplay: string }>> {
  if (!UUID.test(input.professionalId)) return invalid('Professional is missing')
  if (!gustoReady() || !input.accessToken) return notConfigured()
  if (!validBank(input.bank)) return invalid('Bank account details are incomplete')
  if (!input.contractorUuid) return { ok: false, status: 'missing', message: 'Payment profile is not ready' }

  const display = maskedAccount(input.bank.accountNumber)
  if (!display) return invalid('Bank account details are incomplete')

  const result = await gustoRequest({
    method: 'POST',
    path: `/v1/contractors/${input.contractorUuid}/bank_accounts`,
    idempotencyKey: `detox-bank-${input.professionalId}`,
    accessToken: input.accessToken,
    body: {
      name: input.bank.name.trim(),
      routing_number: input.bank.routingNumber,
      account_number: input.bank.accountNumber,
      account_type: input.bank.accountType,
    },
  })
  if (!result.ok) return result
  return { ok: true, status: 'synced', message: 'ok', data: { bankAccountDisplay: display } }
}

function validBank(bank: BankAccountInput): boolean {
  if (!bank.name.trim()) return false
  if (!/^\d{9}$/.test(bank.routingNumber)) return false
  if (!/^\d{4,17}$/.test(bank.accountNumber)) return false
  return bank.accountType === 'Checking' || bank.accountType === 'Savings'
}
