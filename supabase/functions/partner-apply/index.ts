import { json, preflight, serviceClient } from '../_shared/supabase.ts'

type Body = {
  full_name?: string
  email?: string
  password?: string
  birth_date?: string
  gender?: string
  phone?: string
  bio?: string
  address_line?: string
  postal_code?: string
  city_name?: string
  region?: string
  instagram?: string
  specialty_note?: string
  coverage_note?: string
  terms?: boolean
  content_sha256?: string
  scrolled_to_end?: boolean
  checkbox_confirmed?: boolean
}

function text(value: unknown, min: number, max: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length < min || trimmed.length > max) return null
  return trimmed
}

function block(value: unknown, min: number, max: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) return null
  return trimmed
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'The form could not be read.' }, 400)
  }

  const fullName = text(body.full_name, 2, 80)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const birthDate = typeof body.birth_date === 'string' ? body.birth_date.trim() : ''
  const genderRaw = typeof body.gender === 'string' ? body.gender.trim() : ''
  const phone = text(body.phone, 7, 24)
  const bio = block(body.bio, 12, 600)
  const address = text(body.address_line, 5, 160)
  const postal = text(body.postal_code, 3, 12)
  const city = text(body.city_name, 2, 80)
  const region = text(body.region, 2, 40)
  const instagram = text(typeof body.instagram === 'string' ? body.instagram : '', 0, 30)
  const specialty = text(body.specialty_note, 2, 160)
  const coverage = text(body.coverage_note, 2, 160)

  if (!fullName || !phone || !bio || !address || !postal || !city || !region || !specialty || !coverage || instagram === null) {
    return json({ error: 'Fill in every required field.' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400)
  }
  if (
    password.length < 8
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)
  ) {
    return json({ error: 'Use at least 8 characters, with upper and lower case, a number, and a symbol.' }, 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > new Date().toISOString().slice(0, 10)) {
    return json({ error: 'Enter a valid date of birth.' }, 400)
  }
  const gender = genderRaw === '' ? null : genderRaw
  if (gender && !['female', 'male', 'prefer_not'].includes(gender)) {
    return json({ error: 'Choose a gender from the list, or leave it blank.' }, 400)
  }
  const digits = (phone.match(/\d/g) ?? []).length
  if (digits < 8) return json({ error: 'Enter a phone number.' }, 400)
  const handle = instagram.replace(/^@/, '')
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return json({ error: 'Enter an Instagram username, without a link.' }, 400)
  }
  if (body.terms !== true) {
    return json({ error: 'Agree to the Terms of Service and Privacy Policy to apply.' }, 400)
  }

  const admin = serviceClient()
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'profissional' },
    user_metadata: { full_name: fullName },
  })
  if (created.error || !created.data.user) {
    const message = created.error?.message ?? 'Could not create the account.'
    const taken = /already|registered|exists/i.test(message)
    return json({ error: taken ? 'An account with this email already exists.' : 'Could not create the account.' }, taken ? 409 : 400)
  }

  const userId = created.data.user.id
  const saved = await admin.rpc('save_partner_application', {
    p_profile_id: userId,
    p_full_name: fullName,
    p_birth_date: birthDate,
    p_gender: gender,
    p_phone: phone,
    p_bio: bio,
    p_address_line: address,
    p_postal_code: postal,
    p_city_name: city,
    p_region: region,
    p_instagram: handle,
    p_specialty_note: specialty,
    p_coverage_note: coverage,
  })
  if (saved.error) {
    await admin.auth.admin.deleteUser(userId)
    return json({ error: 'Could not save the application.' }, 400)
  }

  const accepted = await admin.rpc('record_terms_acceptance', {
    p_user_id: userId,
    p_email: email,
    p_content_sha256: typeof body.content_sha256 === 'string' ? body.content_sha256 : '',
    p_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || '',
    p_user_agent: req.headers.get('user-agent') ?? '',
    p_locale: 'en',
    p_scrolled_to_end: body.scrolled_to_end === true,
    p_checkbox_confirmed: body.checkbox_confirmed === true,
    p_surface: 'partner_signup',
  })
  if (accepted.error) {
    await admin.auth.admin.deleteUser(userId)
    return json({ error: accepted.error.message }, 400)
  }

  if (bio) {
    await admin.from('professionals').update({ bio }).eq('profile_id', userId)
  }

  return json({ ok: true, user_id: userId })
})
