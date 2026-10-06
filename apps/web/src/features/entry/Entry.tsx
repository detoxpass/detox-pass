import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import {
  acceptTerms,
  loadCities,
  loadEntryState,
  loadPublishedTerms,
  loadServices,
  saveEntryProfile,
  uploadAvatar,
  avatarUrl,
  type EntryState,
  type Session,
} from '../../lib/supabase'
import { Integrations } from '../scheduling/Integrations'
import { Button, ErrorBlock, Field, Icon, LoadingBlock, Logo } from '../../ui'

const STEPS = [
  { id: 'profile', label: 'Profile', icon: 'users' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'terms', label: 'Terms', icon: 'file' },
] as const

const COPY = {
  profile: {
    title: 'Your profile',
    lead: 'Photo, name, and the work you offer. Clients see this only after the team approves you.',
  },
  calendar: {
    title: 'Your calendar',
    lead: 'Publish hours here, or connect a calendar you already use. One is enough.',
  },
  terms: {
    title: 'Terms',
    lead: 'Read this version to the end. Accepting it is what closes the setup.',
  },
} as const

export function Entry({ session, onDone }: { session: Session; onDone: () => void }) {
  const [state, setState] = useState<EntryState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    loadEntryState(session)
      .then((next) => {
        setState(next)
        if (!next.applies || !next.step) onDone()
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not open the setup.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  if (loading) {
    return (
      <div className="entry">
        <div className="account-brand"><Logo onDark={false} /></div>
        <LoadingBlock text="Opening your account…" />
      </div>
    )
  }
  if (error) return <div className="entry"><ErrorBlock text={error} /></div>
  if (!state?.step) return null

  const index = STEPS.findIndex((step) => step.id === state.step)
  const copy = COPY[state.step]

  return (
    <div className="entry">
      <div className="account-brand"><Logo onDark={false} /></div>
      <ol className="entry-rail" style={{ '--progress': index / (STEPS.length - 1) } as CSSProperties}>
        {STEPS.map((step, stepIndex) => {
          const done = stepIndex < index
          const current = stepIndex === index
          return (
            <li key={step.id} className={done ? 'done' : current ? 'on' : ''} aria-current={current ? 'step' : undefined}>
              <span>{done ? <Check /> : <Icon name={step.icon} />}</span>
              {step.label}
            </li>
          )
        })}
      </ol>
      <div className="entry-stage" key={state.step}>
        <Scene step={state.step} />
        <header className="entry-copy">
          <p>Step {index + 1} of {STEPS.length}</p>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>
        {state.step === 'profile' ? <ProfileStep session={session} state={state} onDone={reload} /> : null}
        {state.step === 'calendar' ? <Integrations session={session} embedded onReady={reload} /> : null}
        {state.step === 'terms' ? <TermsStep session={session} onDone={reload} /> : null}
      </div>
    </div>
  )
}

function ProfileStep({ session, state, onDone }: { session: Session; state: EntryState; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(state.display_name ?? '')
  const [bio, setBio] = useState(state.bio ?? '')
  const [photo, setPhoto] = useState(state.portrait_path || (state.avatar_path ? avatarUrl(state.avatar_path) : ''))
  const [services, setServices] = useState(state.service_ids ?? [])
  const [cities, setCities] = useState(state.city_ids ?? [])
  const [catalogServices, setCatalogServices] = useState<{ id: string; name: string }[]>([])
  const [catalogCities, setCatalogCities] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    Promise.all([loadServices(session), loadCities(session)])
      .then(([serviceRows, cityRows]) => {
        setCatalogServices(serviceRows.map((row) => ({ id: row.id, name: row.name })))
        setCatalogCities(cityRows.map((row) => ({ id: row.id, name: row.name })))
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the catalog.'))
  }, [session])

  async function onPhoto(file: File) {
    setUploading(true)
    setError('')
    try {
      const blob = await squareJpeg(file)
      const profile = await uploadAvatar(session, blob)
      setPhoto(avatarUrl(profile.avatar_path, profile.updated_at))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the photo.')
    } finally {
      setUploading(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await saveEntryProfile(session, {
        displayName: name,
        bio,
        portraitPath: photo,
        serviceIds: services,
        cityIds: cities,
      })
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the profile.')
    } finally {
      setBusy(false)
    }
  }

  function toggle(list: string[], id: string, set: (next: string[]) => void) {
    set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  const initial = (name || session.user.email || 'A').slice(0, 1).toUpperCase()

  return (
    <form className="entry-form" onSubmit={save}>
      <div className="account-id">
        <button type="button" className={photo ? 'account-photo' : 'account-photo waiting'} aria-label="Choose a profile photo" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {photo ? <img src={photo} alt="" /> : <span className="account-letter">{initial}</span>}
          <span className="account-cam" aria-hidden="true"><Icon name="camera" /></span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onPhoto(file)
          }}
        />
        <p>{uploading ? 'Uploading the photo…' : 'Tap the photo to change it.'}</p>
      </div>

      <section className="account-card">
        <h2>About you</h2>
        <Field label="Display name">
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        </Field>
        <Field label="Bio">
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} minLength={12} maxLength={600} required />
        </Field>
      </section>

      <PickList title="Services" empty="Services are still loading." items={catalogServices} selected={services} onToggle={(id) => toggle(services, id, setServices)} />
      <PickList title="Cities" empty="Cities are still loading." items={catalogCities} selected={cities} onToggle={(id) => toggle(cities, id, setCities)} />

      <p className="hint">Service prices are set by the team. This step does not set a rate.</p>
      {error ? <p className="error">{error}</p> : null}
      <Button type="submit" disabled={busy || uploading}>{busy ? 'Saving' : 'Continue'}</Button>
    </form>
  )
}

function PickList({ title, empty, items, selected, onToggle }: {
  title: string
  empty: string
  items: { id: string; name: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <section className="account-card">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="hint">{empty}</p> : (
        <div className="entry-picks">
          {items.map((item) => {
            const on = selected.includes(item.id)
            return (
              <button type="button" key={item.id} className="entry-pick" aria-pressed={on} onClick={() => onToggle(item.id)}>
                <span aria-hidden="true">{on ? <Check /> : null}</span>
                {item.name}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TermsStep({ session, onDone }: { session: Session; onDone: () => void }) {
  const [terms, setTerms] = useState<{ title: string; body: string; content_sha256: string; version_number: number } | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadPublishedTerms()
      .then((row) => {
        setTerms(row)
        if (!row) setError('Terms are not published yet.')
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the terms.'))
  }, [])

  useEffect(() => {
    const node = box.current
    if (!node) return
    if (node.scrollHeight <= node.clientHeight + 8) setScrolled(true)
  }, [terms])

  async function accept() {
    if (!terms) return
    setBusy(true)
    setError('')
    try {
      await acceptTerms(session, terms.content_sha256, scrolled, checked)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the acceptance.')
    } finally {
      setBusy(false)
    }
  }

  if (!terms) return error ? <ErrorBlock text={error} /> : <LoadingBlock text="Loading the terms…" />

  return (
    <div className="entry-form">
      <section className="account-card">
        <h2>{terms.title}</h2>
        <p className="entry-version">Version {terms.version_number}</p>
        <div
          className="terms-scroll"
          ref={box}
          onScroll={(event) => {
            const node = event.currentTarget
            if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) setScrolled(true)
          }}
        >
          {terms.body}
        </div>
        <p className={scrolled ? 'account-note' : 'hint'}>{scrolled ? 'You reached the end.' : 'Scroll to the end to continue.'}</p>
        <label className="entry-agree">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>I agree to these terms</span>
        </label>
      </section>
      {error ? <p className="error">{error}</p> : null}
      <Button disabled={busy || !scrolled || !checked} onClick={accept}>{busy ? 'Saving' : 'Accept and continue'}</Button>
    </div>
  )
}

function Scene({ step }: { step: 'profile' | 'calendar' | 'terms' }) {
  if (step === 'calendar') {
    return (
      <svg className="entry-art" viewBox="0 0 220 140" aria-hidden="true">
        <rect x="58" y="28" width="104" height="88" rx="16" fill="#fff" stroke="#161616" strokeWidth="2" />
        <path d="M58 48h104" stroke="#161616" strokeWidth="2" />
        <rect x="58" y="28" width="104" height="20" rx="16" fill="#ffb9b9" />
        <path d="M58 42h104" stroke="#161616" strokeWidth="2" />
        <rect x="78" y="18" width="6" height="18" rx="3" fill="#161616" />
        <rect x="136" y="18" width="6" height="18" rx="3" fill="#161616" />
        <circle cx="82" cy="68" r="5" fill="#ffb9b9" />
        <circle cx="110" cy="68" r="5" fill="#161616" />
        <circle cx="138" cy="68" r="5" fill="#ececec" />
        <circle cx="82" cy="92" r="5" fill="#ececec" />
        <circle cx="110" cy="92" r="5" fill="#ffb9b9" />
        <circle cx="138" cy="92" r="5" fill="#ececec" />
      </svg>
    )
  }
  if (step === 'terms') {
    return (
      <svg className="entry-art" viewBox="0 0 220 140" aria-hidden="true">
        <rect x="62" y="18" width="84" height="104" rx="12" fill="#fff" stroke="#161616" strokeWidth="2" />
        <path d="M78 42h52M78 58h52M78 74h36" stroke="#ececec" strokeWidth="4" strokeLinecap="round" />
        <circle cx="142" cy="96" r="22" fill="#ffb9b9" stroke="#161616" strokeWidth="2" />
        <path d="m132 96 7 7 14-16" fill="none" stroke="#161616" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className="entry-art" viewBox="0 0 220 140" aria-hidden="true">
      <circle cx="110" cy="58" r="22" fill="#ffb9b9" stroke="#161616" strokeWidth="2" />
      <path d="M74 112c4-22 18-32 36-32s32 10 36 32" fill="#fff" stroke="#161616" strokeWidth="2" strokeLinecap="round" />
      <circle cx="156" cy="46" r="14" fill="#fff" stroke="#161616" strokeWidth="2" />
      <path d="M156 40v8M152 46h8" stroke="#161616" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

async function squareJpeg(file: File) {
  const bitmap = await createImageBitmap(file)
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not read that photo.')
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Could not read that photo.')
  return blob
}
