import { useEffect, useRef, useState } from 'react'
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
import { Button, ErrorBlock, LoadingBlock } from '../../ui'

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

  if (loading) return <div className="page"><LoadingBlock text="Opening your account…" /></div>
  if (error) return <div className="page"><ErrorBlock text={error} /></div>
  if (!state?.step) return null

  return (
    <div className="page narrow stack entry-screen">
      <p className="kicker">Step {state.step === 'profile' ? '1 of 3' : state.step === 'calendar' ? '2 of 3' : '3 of 3'}</p>
      <h1>{state.step === 'profile' ? 'Your profile' : state.step === 'calendar' ? 'Your calendar' : 'Terms'}</h1>
      {state.step === 'profile' ? <ProfileStep session={session} state={state} onDone={reload} /> : null}
      {state.step === 'calendar' ? <Integrations session={session} embedded onReady={reload} /> : null}
      {state.step === 'terms' ? <TermsStep session={session} onDone={reload} /> : null}
    </div>
  )
}

function ProfileStep({ session, state, onDone }: { session: Session; state: EntryState; onDone: () => void }) {
  const [name, setName] = useState(state.display_name ?? '')
  const [bio, setBio] = useState(state.bio ?? '')
  const [photo, setPhoto] = useState(state.portrait_path || (state.avatar_path ? avatarUrl(state.avatar_path) : ''))
  const [services, setServices] = useState(state.service_ids ?? [])
  const [cities, setCities] = useState(state.city_ids ?? [])
  const [catalogServices, setCatalogServices] = useState<{ id: string; name: string }[]>([])
  const [catalogCities, setCatalogCities] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([loadServices(session), loadCities(session)])
      .then(([serviceRows, cityRows]) => {
        setCatalogServices(serviceRows.map((row) => ({ id: row.id, name: row.name })))
        setCatalogCities(cityRows.map((row) => ({ id: row.id, name: row.name })))
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the catalog.'))
  }, [session])

  async function onPhoto(file: File) {
    setBusy(true)
    setError('')
    try {
      const profile = await uploadAvatar(session, file)
      const next = avatarUrl(profile.avatar_path, profile.updated_at)
      setPhoto(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the photo.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
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

  return (
    <div className="stack account-card">
      <label className="field">
        <span>Photo</span>
        {photo ? <img className="entry-photo" src={photo} alt="" /> : null}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onPhoto(file)
        }} />
      </label>
      <label className="field"><span>Display name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="field"><span>Bio</span>
        <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} required />
      </label>
      <fieldset className="stack">
        <legend>Services</legend>
        {catalogServices.map((service) => (
          <label key={service.id} className="check">
            <input type="checkbox" checked={services.includes(service.id)} onChange={() => toggle(services, service.id, setServices)} />
            <span>{service.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="stack">
        <legend>Cities</legend>
        {catalogCities.map((city) => (
          <label key={city.id} className="check">
            <input type="checkbox" checked={cities.includes(city.id)} onChange={() => toggle(cities, city.id, setCities)} />
            <span>{city.name}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted">Service prices are set by the team. This step does not set a rate.</p>
      {error ? <ErrorBlock text={error} /> : null}
      <Button disabled={busy} onClick={save}>Continue</Button>
    </div>
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
    <div className="stack account-card">
      <h2>{terms.title}</h2>
      <p className="muted">Version {terms.version_number} · {terms.content_sha256.slice(0, 12)}</p>
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
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>I agree to these terms</span>
      </label>
      {error ? <ErrorBlock text={error} /> : null}
      <Button disabled={busy || !scrolled || !checked} onClick={accept}>Accept and continue</Button>
    </div>
  )
}
