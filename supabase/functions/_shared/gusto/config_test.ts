import { gustoConfig, gustoReady, NOT_CONFIGURED } from './config.ts'
import { gustoRequest } from './client.ts'
import { sanitizeText, sanitizeUnknown } from './sanitize.ts'
import { createGustoContractorPayment, paymentKey } from './payment.ts'

Deno.test('Gusto stays off unless the flag and credentials are present', () => {
  Deno.env.delete('GUSTO_ENABLED')
  Deno.env.delete('GUSTO_CLIENT_ID')
  Deno.env.delete('GUSTO_CLIENT_SECRET')
  Deno.env.delete('GUSTO_COMPANY_UUID')
  Deno.env.delete('GUSTO_API_VERSION')
  const config = gustoConfig()
  if (config.enabled) throw new Error('flag defaulted on')
  if (config.baseUrl !== 'https://api.gusto-demo.com') throw new Error(config.baseUrl)
  if (config.apiVersion !== '2026-06-15') throw new Error(config.apiVersion)
  if (gustoReady(config)) throw new Error('ready without credentials')
})

Deno.test('API version can be overridden', () => {
  Deno.env.set('GUSTO_API_VERSION', '2099-01-01')
  try {
    if (gustoConfig().apiVersion !== '2099-01-01') throw new Error('override ignored')
  } finally {
    Deno.env.delete('GUSTO_API_VERSION')
  }
})

Deno.test('demo mode does not follow a production base URL', () => {
  Deno.env.set('GUSTO_ENV', 'demo')
  Deno.env.set('GUSTO_BASE_URL', 'https://api.gusto.com')
  try {
    if (gustoConfig().baseUrl !== 'https://api.gusto-demo.com') throw new Error('production host leaked into demo')
  } finally {
    Deno.env.delete('GUSTO_ENV')
    Deno.env.delete('GUSTO_BASE_URL')
  }
})

Deno.test('logs and errors drop account numbers and tokens', () => {
  const text = sanitizeUnknown({
    account_number: '5809431207',
    ssn: '123-45-6789',
    access_token: 'secret-token',
    message: 'failed for 5809431207',
  })
  if (text.includes('5809431207') || text.includes('secret-token') || text.includes('123-45-6789')) {
    throw new Error(text)
  }
  if (sanitizeText('routing 021000021').includes('021000021')) throw new Error('routing leaked')
})

Deno.test('disabled client and payment do not call the network', async () => {
  Deno.env.delete('GUSTO_ENABLED')
  const original = globalThis.fetch
  let called = false
  globalThis.fetch = () => {
    called = true
    return Promise.reject(new Error('network'))
  }
  try {
    const request = await gustoRequest({
      method: 'POST',
      path: '/v1/companies/company/contractors',
      idempotencyKey: 'detox-contractor-00000000-0000-0000-0000-000000000000',
      accessToken: 'should-not-be-sent',
      body: { account_number: '5809431207' },
    })
    const payment = await createGustoContractorPayment('00000000-0000-0000-0000-000000000001')
    if (called) throw new Error('fetch ran')
    if (request.message !== NOT_CONFIGURED || payment.message !== NOT_CONFIGURED) {
      throw new Error(`${request.message} ${payment.message}`)
    }
    if (paymentKey('00000000-0000-0000-0000-000000000001') !== 'detox-payment-00000000-0000-0000-0000-000000000001') {
      throw new Error('payment key')
    }
  } finally {
    globalThis.fetch = original
  }
})
