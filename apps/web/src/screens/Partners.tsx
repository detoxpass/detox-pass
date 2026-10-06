import { useEffect, useRef, useState, type FormEvent } from 'react'
import { applyPartner, loadPublishedTerms, signIn } from '../lib/supabase'
import { Button, Field, Logo } from '../ui'

const empty = {
  full_name: '',
  email: '',
  birth_date: '',
  gender: '',
  phone: '',
  password: '',
  confirm: '',
  bio: '',
  address_line: '',
  postal_code: '',
  city_name: '',
  region: '',
  instagram: '',
  specialty_note: '',
  coverage_note: '',
  terms: false,
}

export function Partners({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [termsText, setTermsText] = useState<{ title: string; body: string; content_sha256: string; version_number: number } | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const termsBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadPublishedTerms()
      .then((row) => setTermsText(row))
      .catch(() => setTermsText(null))
  }, [])

  useEffect(() => {
    const node = termsBox.current
    if (node && node.scrollHeight <= node.clientHeight + 8) setScrolled(true)
  }, [termsText])

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!termsText) {
      setError('Terms are not published yet.')
      return
    }
    if (!scrolled || !form.terms) {
      setError('Scroll through the terms and check the box.')
      return
    }
    setPending(true)
    try {
      await applyPartner({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        birth_date: form.birth_date,
        gender: form.gender,
        phone: form.phone,
        bio: form.bio,
        address_line: form.address_line,
        postal_code: form.postal_code,
        city_name: form.city_name,
        region: form.region,
        instagram: form.instagram,
        specialty_note: form.specialty_note,
        coverage_note: form.coverage_note,
        terms: true,
        content_sha256: termsText.content_sha256,
        scrolled_to_end: true,
        checkbox_confirmed: true,
      })
      await signIn(form.email, form.password)
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the application.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="partner">
      <section className="partner-hero">
        <Logo />
        <p className="partner-kicker">Partner application</p>
        <h1>Your practice.<br />Their next booking<span>.</span></h1>
        <p className="partner-lead">Apply once. The account is a professional account, and clients only see you after the team approves the profile.</p>
        <div className="partner-hero-actions">
          <a className="btn" href="#apply">Apply as a partner</a>
          <button type="button" className="btn ghost" onClick={onSignIn}>Sign in</button>
        </div>
      </section>

      <section className="partner-steps">
        <article>
          <span>01</span>
          <h2>Tell us who you are</h2>
          <p>Name, contact, address, and the work you do. The same details the professional profile asks for.</p>
        </article>
        <article>
          <span>02</span>
          <h2>We review the application</h2>
          <p>You can sign in right away. The profile stays off the client search until the team approves it.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Open your calendar</h2>
          <p>After you enter, choose an internal calendar or connect your own external one. Prices stay with the team.</p>
        </article>
      </section>

      <section className="partner-apply" id="apply">
        <div className="partner-apply-copy">
          <p className="partner-kicker dark">Create your partner account</p>
          <h2>Apply in one sitting.</h2>
          <p>No email code. The account is created as a professional and waits for review.</p>
        </div>
        <form className={error ? 'partner-form invalid' : 'partner-form'} onSubmit={submit}>
          <h3>Personal information</h3>
          <div className="partner-grid">
            <Field label="Full name">
              <input value={form.full_name} onChange={(event) => set('full_name', event.target.value)} autoComplete="name" placeholder="Enter your full name" required />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} autoComplete="email" placeholder="Enter your email address" required />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.birth_date} onChange={(event) => set('birth_date', event.target.value)} autoComplete="bday" required />
            </Field>
            <Field label="Gender (optional)">
              <select value={form.gender} onChange={(event) => set('gender', event.target.value)}>
                <option value="">Select your gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
            </Field>
            <Field label="Phone number">
              <input value={form.phone} onChange={(event) => set('phone', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="(1) 0000-0000" required />
            </Field>
            <Field label="Instagram username">
              <input value={form.instagram} onChange={(event) => set('instagram', event.target.value)} autoComplete="off" placeholder="@username" maxLength={30} />
            </Field>
          </div>
          <Field label="Bio">
            <textarea value={form.bio} onChange={(event) => set('bio', event.target.value)} placeholder="Tell about your work. This stays with the application until the team reviews it." minLength={12} maxLength={600} required />
          </Field>
          <p className="hint">Your bio is saved with the application. It is not shown on the public profile yet.</p>

          <h3>Password</h3>
          <div className="partner-grid">
            <Field label="Password">
              <input type="password" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" placeholder="Create a strong password" minLength={8} required />
            </Field>
            <Field label="Confirm password">
              <input type="password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} autoComplete="new-password" placeholder="Confirm your password" minLength={8} required />
            </Field>
          </div>
          <p className="hint">At least 8 characters. Include upper and lower case, one number, and one symbol.</p>

          <h3>Contact and address</h3>
          <Field label="Base address">
            <input value={form.address_line} onChange={(event) => set('address_line', event.target.value)} autoComplete="street-address" placeholder="Enter your base address" required />
          </Field>
          <div className="partner-grid three">
            <Field label="ZIP code">
              <input value={form.postal_code} onChange={(event) => set('postal_code', event.target.value)} autoComplete="postal-code" placeholder="ZIP code" required />
            </Field>
            <Field label="City">
              <input value={form.city_name} onChange={(event) => set('city_name', event.target.value)} autoComplete="address-level2" placeholder="Enter city" required />
            </Field>
            <Field label="State">
              <input value={form.region} onChange={(event) => set('region', event.target.value)} autoComplete="address-level1" placeholder="Enter state" required />
            </Field>
          </div>

          <h3>Specializations and coverage area</h3>
          <div className="partner-grid">
            <Field label="Specializations">
              <input value={form.specialty_note} onChange={(event) => set('specialty_note', event.target.value)} placeholder="The work you offer" required />
            </Field>
            <Field label="Coverage area">
              <input value={form.coverage_note} onChange={(event) => set('coverage_note', event.target.value)} placeholder="Cities or how far you travel" required />
            </Field>
          </div>
          <p className="hint">Service prices are set by the team after approval. This form does not set a rate.</p>

          {termsText ? (
            <>
              <h3>{termsText.title}</h3>
              <p className="hint">Version {termsText.version_number}</p>
              <div
                className="terms-scroll"
                ref={termsBox}
                onScroll={(event) => {
                  const node = event.currentTarget
                  if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) setScrolled(true)
                }}
              >{termsText.body}</div>
              <label className="check partner-terms">
                <input type="checkbox" checked={form.terms} onChange={(event) => set('terms', event.target.checked)} required />
                <span>I agree to these terms</span>
              </label>
            </>
          ) : <p className="hint">Terms are not published yet. This form cannot be sent until they are.</p>}
          {error ? <p className="error">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? 'Please wait' : 'Send application'}</Button>
          <p className="center">Already have an account? <button type="button" className="link" onClick={onSignIn}>Sign in</button></p>
        </form>
      </section>

      {done ? (
        <div className="partner-done" role="dialog" aria-modal="true" aria-labelledby="partner-done-title">
          <div>
            <span className="warn-badge">…</span>
            <h2 id="partner-done-title">Registration under review</h2>
            <p>Your partner account is ready. Clients will not see this profile until the team approves it.</p>
            <Button onClick={onEnter}>Got it</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
