import { gustoConfig, gustoReady, NOT_CONFIGURED } from './config.ts'
import { sanitizeText, sanitizeUnknown } from './sanitize.ts'

export type GustoStatus = 'not_configured' | 'already_synced' | 'synced' | 'invalid' | 'missing' | 'forbidden'

export type GustoResult<T = Record<string, never>> = {
  ok: boolean
  status: GustoStatus
  message: string
  persistError?: boolean
  data?: T
}

export type TokenSet = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
}

export function notConfigured(message = NOT_CONFIGURED): GustoResult {
  return { ok: true, status: 'not_configured', message }
}

export function invalid(message: string): GustoResult {
  return { ok: false, status: 'invalid', message: sanitizeText(message) }
}

type GustoRequest = {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  idempotencyKey?: string
  body?: Record<string, unknown>
  accessToken?: string
}

export async function gustoRequest(input: GustoRequest): Promise<GustoResult<{ body: unknown }>> {
  const config = gustoConfig()
  if (!gustoReady(config)) return notConfigured()
  if (!input.accessToken) return notConfigured()
  if (input.method === 'POST' && !input.idempotencyKey?.startsWith('detox-')) {
    return invalid('Missing idempotency key')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    return await send(config, input, controller.signal, true)
  } finally {
    clearTimeout(timer)
  }
}

async function send(
  config: ReturnType<typeof gustoConfig>,
  input: GustoRequest,
  signal: AbortSignal,
  allowRetry: boolean,
): Promise<GustoResult<{ body: unknown }>> {
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method,
      signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
        'x-gusto-api-version': config.apiVersion,
        ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    })
  } catch {
    return { ok: false, status: 'invalid', message: 'Gusto request failed', persistError: true }
  }

  if ((response.status === 429 || response.status === 503) && allowRetry && input.idempotencyKey) {
    return send(config, input, signal, false)
  }

  const text = await response.text()
  if (!response.ok) {
    return { ok: false, status: 'invalid', message: sanitizeUnknown(text || 'Gusto request failed'), persistError: true }
  }

  if (!text) return { ok: true, status: 'synced', message: 'ok', data: { body: null } }
  try {
    return { ok: true, status: 'synced', message: 'ok', data: { body: JSON.parse(text) } }
  } catch {
    return { ok: false, status: 'invalid', message: 'Gusto returned an unreadable response' }
  }
}

export async function exchangeClientCredentials(): Promise<GustoResult<TokenSet>> {
  if (!gustoReady()) return notConfigured()
  return notConfigured()
}

export async function refreshAccessToken(_refreshToken: string): Promise<GustoResult<TokenSet>> {
  if (!gustoReady()) return notConfigured()
  return notConfigured()
}
