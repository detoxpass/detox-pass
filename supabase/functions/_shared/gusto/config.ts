export type GustoEnv = 'demo' | 'production'

export type GustoConfig = {
  enabled: boolean
  env: GustoEnv
  baseUrl: string
  apiVersion: string
  companyUuid: string
  clientId: string
  clientSecret: string
}

const DEMO_BASE = 'https://api.gusto-demo.com'
const DEFAULT_API_VERSION = '2026-06-15'

// Scopes da Application. payrolls:run só entra na POC de pagamento.
export const GUSTO_SCOPES = {
  contractors: 'contractors:manage',
  bankAccount: 'contractor_payment_methods:write',
  contractorPayment: 'payrolls:run',
} as const

export function gustoConfig(): GustoConfig {
  const enabled = Deno.env.get('GUSTO_ENABLED') === 'true'
  const env: GustoEnv = Deno.env.get('GUSTO_ENV') === 'production' ? 'production' : 'demo'
  const requested = (Deno.env.get('GUSTO_BASE_URL') || DEMO_BASE).replace(/\/$/, '')
  const baseUrl = env === 'demo' && !requested.includes('gusto-demo.com') ? DEMO_BASE : requested
  return {
    enabled,
    env,
    baseUrl,
    apiVersion: Deno.env.get('GUSTO_API_VERSION') || DEFAULT_API_VERSION,
    companyUuid: Deno.env.get('GUSTO_COMPANY_UUID') ?? '',
    clientId: Deno.env.get('GUSTO_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('GUSTO_CLIENT_SECRET') ?? '',
  }
}

export function gustoReady(config = gustoConfig()): boolean {
  return config.enabled
    && config.clientId.length > 0
    && config.clientSecret.length > 0
    && config.companyUuid.length > 0
}

export const NOT_CONFIGURED = 'Gusto integration is not configured'
