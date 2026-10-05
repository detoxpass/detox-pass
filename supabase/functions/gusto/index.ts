import { json, preflight } from '../_shared/supabase.ts'

Deno.serve((req) => {
  const early = preflight(req)
  if (early) return early
  if (Deno.env.get('GUSTO_ENABLED') !== 'true') {
    return json({
      status: 'optional_not_enabled',
      detail: 'Gusto só entra se a cliente do contrato optar, e nunca no checkout.',
    }, 501)
  }
  return json({
    status: 'pending',
    detail: 'Estrutura final do Gusto ainda não foi aprovada. Não faz split da cobrança Stripe.',
  }, 501)
})
