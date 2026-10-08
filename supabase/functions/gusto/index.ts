import { json, preflight, requireUser } from '../_shared/supabase.ts'
import { NOT_CONFIGURED } from '../_shared/gusto/config.ts'
import { createGustoContractorPayment } from '../_shared/gusto/payment.ts'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ status: 'not_configured', message: NOT_CONFIGURED })

  const auth = await requireUser(req)
  if (auth.error) return auth.error

  let body: { booking_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'json inválido' }, 400)
  }

  if (!body.booking_id) return json({ status: 'not_configured', message: NOT_CONFIGURED })

  const result = await createGustoContractorPayment(body.booking_id)
  return json({ status: result.status, message: result.message }, result.ok ? 200 : 400)
})
