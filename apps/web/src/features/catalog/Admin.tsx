import { useEffect, useState, type FormEvent } from 'react'
import {
  callFunction,
  insertRow,
  listAccounts,
  loadAdminProfessionals,
  loadCities,
  loadServices,
  loadSpecialties,
  patchRow,
  portraits,
  replaceLinks,
  setAppRole,
  type AccountRow,
  type AdminProfessional,
  type CatalogCity,
  type CatalogService,
  type CatalogSpecialty,
  type Session,
} from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, Field, LoadingBlock, Notice, PendingBlock } from '../../ui'

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function useLoad<T>(session: Session, load: (session: Session) => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  function reload() {
    setLoading(true)
    setError('')
    load(session)
      .then(setRows)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session])
  return { rows, error, loading, reload }
}

export function UsersScreen({ session }: { session: Session }) {
  const { rows, error, loading, reload } = useLoad<AccountRow>(session, listAccounts)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={reload} />
  if (rows.length === 0) return <EmptyBlock title="No accounts" text="People show up here after they create an account." />
  return (
    <div className="stack">
      {notice ? <Notice text={notice} /> : null}
      {rows.map((row) => (
        <article className="catalog-card" key={row.id}>
          <strong>{row.full_name || row.email}</strong>
          <span>{row.email}</span>
          <span>{row.role}</span>
          {row.role === 'cliente' && row.id !== session.user.id ? (
            <Button disabled={busy === row.id} onClick={() => {
              setBusy(row.id)
              setAppRole(session, row.id, 'profissional')
                .then(() => { setNotice(`${row.email} is a professional and stays hidden until activated.`); reload() })
                .catch((caught: unknown) => setNotice(caught instanceof Error ? caught.message : 'Could not change the role.'))
                .finally(() => setBusy(''))
            }}>Make professional</Button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

export function ServicesScreen({ session }: { session: Session }) {
  return <NamedPriceScreen session={session} title="Services" table="services" load={loadServices} />
}

export function CitiesScreen({ session }: { session: Session }) {
  return <NamedScreen session={session} title="Cities" table="cities" load={loadCities} />
}

export function SpecialtiesScreen({ session }: { session: Session }) {
  return <NamedScreen session={session} title="Specialties" table="specialties" load={loadSpecialties} />
}

function NamedScreen({ session, title, table, load }: {
  session: Session
  title: string
  table: string
  load: (session: Session) => Promise<{ id: string; name: string; slug: string }[]>
}) {
  const { rows, error, loading, reload } = useLoad(session, load)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    try {
      await insertRow(session, table, { name: name.trim(), slug: slugify(name) })
      setName('')
      setNotice('Saved.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={reload} />
  return (
    <div className="stack">
      <form className="account-card" onSubmit={submit}>
        <h2>New {title.toLowerCase()}</h2>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Button type="submit">Save</Button>
        {notice ? <Notice text={notice} /> : null}
      </form>
      {rows.length === 0 ? <EmptyBlock title={`No ${title.toLowerCase()}`} text="Add the first one above." /> : (
        <div className="catalog-grid">
          {rows.map((row) => <article className="catalog-card" key={row.id}><strong>{row.name}</strong><span>{row.slug}</span></article>)}
        </div>
      )}
    </div>
  )
}

function NamedPriceScreen({ session, title, table, load }: {
  session: Session
  title: string
  table: string
  load: (session: Session) => Promise<CatalogService[]>
}) {
  const { rows, error, loading, reload } = useLoad(session, load)
  const [name, setName] = useState('')
  const [dollars, setDollars] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = Math.round(Number(dollars) * 100)
    if (!name.trim() || !Number.isFinite(cents) || cents <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      setNotice('Name, price and currency have to be saved together.')
      return
    }
    try {
      await insertRow(session, table, { name: name.trim(), slug: slugify(name), price_cents: cents, currency })
      setName('')
      setDollars('')
      setNotice('Saved.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={reload} />
  return (
    <div className="stack">
      <form className="account-card" onSubmit={submit}>
        <h2>New {title.toLowerCase()}</h2>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Price"><input inputMode="decimal" value={dollars} onChange={(event) => setDollars(event.target.value)} required /></Field>
        <Field label="Currency"><input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required /></Field>
        <Button type="submit">Save</Button>
        {notice ? <Notice text={notice} /> : null}
      </form>
      {rows.length === 0 ? <EmptyBlock title="No services" text="Add a service with its price." /> : (
        <div className="catalog-grid">
          {rows.map((row) => (
            <article className="catalog-card" key={row.id}>
              <strong>{row.name}</strong>
              <span>{row.price_cents != null && row.currency ? `${row.currency} ${(row.price_cents / 100).toFixed(2)}` : 'Price pending'}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export function TherapistsScreen({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const { rows, error, loading, reload } = useLoad<AdminProfessional>(session, loadAdminProfessionals)
  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={reload} />
  if (rows.length === 0) return <EmptyBlock title="No professionals" text="Promote an account first. New professionals stay inactive." />
  return (
    <div className="catalog-grid">
      {rows.map((row) => (
        <button type="button" className="catalog-card" key={row.id} onClick={() => onOpen(row.id)}>
          <strong>{row.display_name}</strong>
          <span>{row.active ? 'Active' : 'Hidden'}</span>
        </button>
      ))}
    </div>
  )
}

export function TherapistEditor({ session, id }: { session: Session; id: string }) {
  const [row, setRow] = useState<AdminProfessional | null>(null)
  const [services, setServices] = useState<CatalogService[]>([])
  const [cities, setCities] = useState<CatalogCity[]>([])
  const [specialties, setSpecialties] = useState<CatalogSpecialty[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [typeId, setTypeId] = useState('')
  const [squareEnvironment, setSquareEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [squareToken, setSquareToken] = useState('')

  function reload() {
    setLoading(true)
    Promise.all([loadAdminProfessionals(session), loadServices(session), loadCities(session), loadSpecialties(session)])
      .then(([people, nextServices, nextCities, nextSpecialties]) => {
        setRow(people.find((item) => item.id === id) ?? null)
        setServices(nextServices)
        setCities(nextCities)
        setSpecialties(nextSpecialties)
        const connection = people.find((item) => item.id === id)?.schedule_connections?.find((item) => item.provider === 'acuity')
        setTypeId(connection?.external_resource_id ?? '')
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the professional.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session, id])

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={reload} />
  if (!row) return <EmptyBlock title="Professional not found" text="This profile is not in the catalog." />

  const current = row
  const connection = current.schedule_connections?.find((item) => item.provider === 'acuity')
  const serviceIds = new Set((row.professional_services ?? []).map((item) => item.service_id))
  const cityIds = new Set((row.professional_cities ?? []).map((item) => item.city_id))
  const specialtyIds = new Set((row.professional_specialties ?? []).map((item) => item.specialty_id))

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    const form = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await patchRow(session, 'professionals', current.id, {
        display_name: String(form.get('display_name') || '').trim(),
        active: form.get('active') === 'on',
        portrait_path: String(form.get('portrait') || '') || null,
      })
      setNotice('Profile saved. Inactive professionals stay off the client search.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }

  async function toggle(table: string, column: string, selected: Set<string>, value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    try {
      await replaceLinks(session, table, column, current.id, [...next])
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not update the link.')
    }
  }

  async function saveConnection(event: FormEvent) {
    event.preventDefault()
    if (!/^\d+$/.test(typeId)) {
      setNotice('The appointment type has to be a positive number.')
      return
    }
    try {
      if (connection) await patchRow(session, 'schedule_connections', connection.id, { external_resource_id: typeId })
      else await insertRow(session, 'schedule_connections', { professional_id: current.id, provider: 'acuity', external_resource_id: typeId, status: 'pending' })
      setNotice('Connection saved. Status stays pending until a real test.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save the connection.')
    }
  }

  async function saveSecret(event: FormEvent) {
    event.preventDefault()
    if (!connection) {
      setNotice('Save the appointment type first.')
      return
    }
    try {
      const result = await callFunction(session, 'scheduling-acuity', {
        action: 'store_secret',
        connection_id: connection.id,
        token: { userId, apiKey },
      })
      if (result.status >= 400) throw new Error('Could not store the calendar token.')
      setUserId('')
      setApiKey('')
      setNotice('Token stored. It is not shown again.')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not store the token.')
    }
  }

  return (
    <div className="stack">
      <form className="account-card" onSubmit={saveProfile}>
        <h2>{row.display_name}</h2>
        <Field label="Display name"><input name="display_name" defaultValue={row.display_name} required /></Field>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={row.active} /> Active on the client search</label>
        <div className="portrait-pick">
          {portraits.map((photo) => (
            <label key={photo}>
              <input type="radio" name="portrait" value={photo} defaultChecked={row.portrait_path === photo} />
              <img src={photo} alt="" />
            </label>
          ))}
        </div>
        {!row.portrait_path ? <p className="muted">No photo of their own. The client page uses the shared fallback.</p> : null}
        <Button type="submit">Save profile</Button>
      </form>
      <section className="account-card">
        <h2>Services</h2>
        <div className="check-row">
          {services.map((item) => (
            <label key={item.id}><input type="checkbox" checked={serviceIds.has(item.id)} onChange={() => toggle('professional_services', 'service_id', serviceIds, item.id)} />{item.name}</label>
          ))}
        </div>
        <h2>Cities</h2>
        <div className="check-row">
          {cities.map((item) => (
            <label key={item.id}><input type="checkbox" checked={cityIds.has(item.id)} onChange={() => toggle('professional_cities', 'city_id', cityIds, item.id)} />{item.name}</label>
          ))}
        </div>
        <h2>Specialties</h2>
        {specialties.length === 0 ? <EmptyBlock title="No specialties" text="Add one before linking it here." /> : (
          <div className="check-row">
            {specialties.map((item) => (
              <label key={item.id}><input type="checkbox" checked={specialtyIds.has(item.id)} onChange={() => toggle('professional_specialties', 'specialty_id', specialtyIds, item.id)} />{item.name}</label>
            ))}
          </div>
        )}
      </section>
      <form className="account-card" onSubmit={async (event) => {
        event.preventDefault()
        try {
          const result = await callFunction(session, 'scheduling-square', {
            action: 'connect',
            professional_id: current.id,
            environment: squareEnvironment,
            access_token: squareToken,
          })
          const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : {}
          if (body.status === 'choose') {
            setNotice('This Square account has more than one location, person, or service. The professional picks them on Agenda.')
            return
          }
          if (!body.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Square did not connect.')
          setSquareToken('')
          setNotice('Square connected. The token is not shown again. Status stays pending until a live booking.')
          reload()
        } catch (caught) {
          setNotice(caught instanceof Error ? caught.message : 'Could not connect Square.')
        }
      }}>
        <h2>Square</h2>
        <p>Status: {current.schedule_connections?.find((item) => item.provider === 'square')?.status ?? 'not connected'}. Paste the access token. Location, person, and service come from the account when there is only one of each.</p>
        <Field label="Environment">
          <select value={squareEnvironment} onChange={(event) => setSquareEnvironment(event.target.value === 'production' ? 'production' : 'sandbox')}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Live</option>
          </select>
        </Field>
        <Field label="Access token"><input value={squareToken} onChange={(event) => setSquareToken(event.target.value)} type="password" autoComplete="off" required /></Field>
        <Button type="submit" disabled={squareToken.trim() === ''}>Connect Square</Button>
      </form>
      <form className="account-card" onSubmit={saveConnection}>
        <h2>Acuity</h2>
        <p>Status: {connection?.status ?? 'pending'}. Homologated is not a choice on this form.</p>
        <Field label="Appointment type"><input value={typeId} onChange={(event) => setTypeId(event.target.value)} inputMode="numeric" /></Field>
        <Button type="submit">Save connection</Button>
      </form>
      <form className="account-card" onSubmit={saveSecret}>
        <h2>Calendar token</h2>
        {connection ? null : <PendingBlock text="Save the connection before sending a token." />}
        <Field label="User ID"><input value={userId} onChange={(event) => setUserId(event.target.value)} autoComplete="off" /></Field>
        <Field label="API key"><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" /></Field>
        <Button type="submit" disabled={!connection}>Store token</Button>
      </form>
      {notice ? <Notice text={notice} /> : null}
    </div>
  )
}
