import { appRole, json, preflight, requireUser, serviceClient } from '../_shared/supabase.ts'

type Body = {
  content_sha256?: string
  scrolled_to_end?: boolean
  checkbox_confirmed?: boolean
  locale?: string
}

function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || ''
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  if (appRole(auth.user) !== 'profissional') return json({ error: 'Only a professional accepts these terms.' }, 403)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The form could not be read.' }, 400)
  }

  const email = auth.user.email ?? ''
  if (!email) return json({ error: 'This account has no email.' }, 422)

  const { data, error } = await serviceClient().rpc('record_terms_acceptance', {
    p_user_id: auth.user.id,
    p_email: email,
    p_content_sha256: body.content_sha256 ?? '',
    p_ip: clientIp(req),
    p_user_agent: req.headers.get('user-agent') ?? '',
    p_locale: body.locale ?? '',
    p_scrolled_to_end: body.scrolled_to_end === true,
    p_checkbox_confirmed: body.checkbox_confirmed === true,
    p_surface: 'onboarding',
  })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true, id: data })
})
