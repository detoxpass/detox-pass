import { appRole, json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'

type Body = {
  action?: string
  booking_id?: string
  user_id?: string
  role?: string
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

  const action = body.action
  if (action === 'confirm_attendance') {
    const { error } = await auth.client.rpc('confirm_attendance', { p_booking_id: body.booking_id })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'authorize_payout') {
    const { error } = await auth.client.rpc('authorize_payout', { p_booking_id: body.booking_id })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'set_app_role') {
    const { error } = await auth.client.rpc('set_app_role', {
      p_user_id: body.user_id,
      p_role: body.role,
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'finance_report') {
    const { data, error } = await auth.client.rpc('finance_report')
    if (error) return json({ error: error.message }, 400)
    return json({ rows: data })
  }

  if (action === 'retry_payments') {
    if (appRole(auth.user) !== 'operacao') {
      return json({ error: 'só a operação reconcilia pagamento' }, 403)
    }
    const { data, error } = await serviceClient().rpc('retry_unapplied_payment_events')
    if (error) return json({ error: error.message }, 400)
    return json({ reprocessed: data })
  }

  return json({ error: 'ação desconhecida' }, 400)
})
