import { useEffect, useState, type FormEvent } from 'react'
import {
  addBlock,
  callFunction,
  deleteRow,
  insertRow,
  listAccounts,
  listPartnerApplications,
  loadAdminProfessionals,
  loadBlocks,
  loadCalendarOrder,
  loadCities,
  loadHours,
  loadMarketplaceSettings,
  loadProfessionalSteps,
  loadServices,
  loadSpecialties,
  loadTermsAdmin,
  patchRow,
  portraits,
  removeBlock,
  replaceHours,
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
import { PaymentSetupCard } from '../payments/PaymentSetup'

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const WEEKDAYS: [number, string][] = [
  [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday'],
]
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo']
const LENGTHS = [30, 45, 60, 90, 120]

function minuteLabel(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function zonedInstant(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString()
}

function genderLabel(value: string | null) {
  if (value === 'female') return 'Female'
  if (value === 'male') return 'Male'
  if (value === 'prefer_not') return 'Prefer not to say'
  return ''
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

const roleLabel: Record<string, string> = { cliente: 'Client', profissional: 'Professional', operacao: 'Operations' }

export function UsersScreen({ session }: { session: Session }) {
  const { rows, error, loading, reload } = useLoad<AccountRow>(session, listAccounts)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  const operators = rows.filter((row) => row.role === 'operacao').length
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((row) => {
    if (roleFilter && row.role !== roleFilter) return false
    if (!needle) return true
    return `${row.full_name ?? ''} ${row.email}`.toLowerCase().includes(needle)
  })
  return (
    <div className="page stack">
      <header className="page-head"><h1>Accounts</h1><p>A role change applies the next time that person signs in.</p></header>
      <div className="admin-filters">
        <Field label="Search"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name or email" /></Field>
        <Field label="Role">
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">All</option>
            <option value="cliente">Client</option>
            <option value="profissional">Professional</option>
            <option value="operacao">Operations</option>
          </select>
        </Field>
      </div>
      {notice ? <Notice text={notice} /> : null}
      {shown.length === 0 ? <EmptyBlock title="No accounts" text="Nobody matches this search." /> : shown.map((row) => {
        const mine = row.id === session.user.id
        const lastOperator = row.role === 'operacao' && operators <= 1
        const nextRole = drafts[row.id] ?? row.role
        return (
          <article className="catalog-card" key={row.id}>
            <strong>{row.full_name || row.email}</strong>
            <span>{row.email}</span>
            <span>{roleLabel[row.role] ?? row.role}</span>
            {mine || lastOperator ? <p className="muted">{mine ? 'This is your account. You stay in operations.' : 'This is the only operations account.'}</p> : (
              <div className="admin-filters">
                <Field label="Role">
                  <select value={nextRole} onChange={(event) => setDrafts({ ...drafts, [row.id]: event.target.value })}>
                    <option value="cliente">Client</option>
                    <option value="profissional">Professional</option>
                    <option value="operacao">Operations</option>
                  </select>
                </Field>
                <Button disabled={busy === row.id || nextRole === row.role} onClick={() => {
                  setBusy(row.id)
                  setAppRole(session, row.id, nextRole)
                    .then(() => {
                      setNotice(nextRole === 'profissional'
                        ? `${row.email} is a professional and stays hidden until activated. The role applies at the next sign-in.`
                        : `${row.email} will be ${roleLabel[nextRole] ?? nextRole} at the next sign-in.`)
                      reload()
                    })
                    .catch((caught: unknown) => setNotice(caught instanceof Error ? caught.message : 'Could not change the role.'))
                    .finally(() => setBusy(''))
                }}>Save role</Button>
              </div>
            )}
          </article>
        )
      })}
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

function CatalogHealth({ session }: { session: Session }) {
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([loadAdminProfessionals(session), loadServices(session), loadCities(session), loadSpecialties(session), loadMarketplaceSettings(session)])
      .then(([people, services, cities, specialties, settings]) => {
        const usedServices = new Set(people.flatMap((person) => (person.professional_services ?? []).map((item) => item.service_id)))
        const usedCities = new Set(people.flatMap((person) => (person.professional_cities ?? []).map((item) => item.city_id)))
        const usedSpecialties = new Set(people.flatMap((person) => (person.professional_specialties ?? []).map((item) => item.specialty_id)))
        const next = [
          ...services.filter((item) => !usedServices.has(item.id)).map((item) => `Service without a professional: ${item.name}`),
          ...cities.filter((item) => !usedCities.has(item.id)).map((item) => `City without a professional: ${item.name}`),
          ...specialties.filter((item) => !usedSpecialties.has(item.id)).map((item) => `Specialty without a professional: ${item.name}`),
          ...people.filter((person) => person.active && ((person.professional_services ?? []).length === 0 || (person.professional_cities ?? []).length === 0)).map((person) => `Active professional missing a service or a city: ${person.display_name}`),
          ...services.filter((item) => settings?.currency && item.currency && item.currency !== settings.currency).map((item) => `Currency differs: ${item.name} is ${item.currency}, platform is ${settings?.currency}`),
        ]
        setLines(next)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not check the catalog.'))
  }, [session])
  if (error) return <ErrorBlock text={error} />
  return (
    <section className="account-card">
      <h2>Catalog health</h2>
      {lines.length === 0 ? <p className="muted">Every service, city, and specialty is linked, and active professionals have both a service and a city.</p> : lines.map((line) => <p key={line}>{line}</p>)}
    </section>
  )
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
  const [editing, setEditing] = useState('')
  const [draftName, setDraftName] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    const slug = slugify(name)
    if (!name.trim() || !slug) {
      setNotice('Name needs letters or numbers.')
      return
    }
    try {
      await insertRow(session, table, { name: name.trim(), slug })
      setName('')
      setNotice('Saved.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  async function saveRow(id: string) {
    const slug = slugify(draftName)
    if (!draftName.trim() || !slug) {
      setNotice('Name needs letters or numbers.')
      return
    }
    try {
      await patchRow(session, table, id, { name: draftName.trim(), slug })
      setEditing('')
      setNotice('Saved.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  async function remove(id: string) {
    try {
      await deleteRow(session, table, id)
      setNotice('Deleted.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not delete. A professional may still use this.')
    }
  }
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  return (
    <div className="page stack">
      <CatalogHealth session={session} />
      <form className="account-card" onSubmit={submit}>
        <h2>New {title.toLowerCase()}</h2>
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Button type="submit">Save</Button>
        {notice ? <Notice text={notice} /> : null}
      </form>
      {rows.length === 0 ? <EmptyBlock title={`No ${title.toLowerCase()}`} text="Add the first one above." /> : (
        <div className="catalog-grid">
          {rows.map((row) => (
            <article className="catalog-card" key={row.id}>
              {editing === row.id ? (
                <>
                  <Field label="Name"><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></Field>
                  <Button onClick={() => saveRow(row.id)}>Save</Button>
                </>
              ) : <strong>{row.name}</strong>}
              <span>{row.slug}</span>
              {editing === row.id ? null : <Button kind="ghost" onClick={() => { setEditing(row.id); setDraftName(row.name) }}>Edit</Button>}
              <Button kind="ghost" onClick={() => remove(row.id)}>Delete</Button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function pricePair(dollars: string, currency: string) {
  const cents = Math.round(Number(dollars) * 100)
  if (!Number.isFinite(cents) || cents <= 0 || !/^[A-Z]{3}$/.test(currency)) return null
  return { cents, currency }
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
  const [editing, setEditing] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDollars, setDraftDollars] = useState('')
  const [draftCurrency, setDraftCurrency] = useState('USD')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const pair = pricePair(dollars, currency)
    const slug = slugify(name)
    if (!name.trim() || !slug || !pair) {
      setNotice('Name, price and currency have to be saved together.')
      return
    }
    try {
      await insertRow(session, table, { name: name.trim(), slug, price_cents: pair.cents, currency: pair.currency })
      setName('')
      setDollars('')
      setNotice('Saved.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  async function saveRow(id: string) {
    const pair = pricePair(draftDollars, draftCurrency)
    const slug = slugify(draftName)
    if (!draftName.trim() || !slug || !pair) {
      setNotice('Name, price and currency have to be saved together.')
      return
    }
    try {
      await patchRow(session, table, id, { name: draftName.trim(), slug, price_cents: pair.cents, currency: pair.currency })
      setEditing('')
      setNotice('Saved. Reservations already stored keep their recorded amount.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }
  async function remove(id: string) {
    try {
      await deleteRow(session, table, id)
      setNotice('Deleted.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not delete. A professional or a reservation may still use this.')
    }
  }
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  return (
    <div className="page stack">
      <CatalogHealth session={session} />
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
              {editing === row.id ? (
                <>
                  <Field label="Name"><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></Field>
                  <Field label="Price"><input inputMode="decimal" value={draftDollars} onChange={(event) => setDraftDollars(event.target.value)} /></Field>
                  <Field label="Currency"><input value={draftCurrency} maxLength={3} onChange={(event) => setDraftCurrency(event.target.value.toUpperCase())} /></Field>
                  <Button onClick={() => saveRow(row.id)}>Save</Button>
                </>
              ) : (
                <>
                  <strong>{row.name}</strong>
                  <span>{row.price_cents != null && row.currency ? `${row.currency} ${(row.price_cents / 100).toFixed(2)}` : 'Price pending'}</span>
                </>
              )}
              {editing === row.id ? null : <Button kind="ghost" onClick={() => {
                setEditing(row.id)
                setDraftName(row.name)
                setDraftDollars(row.price_cents != null ? (row.price_cents / 100).toFixed(2) : '')
                setDraftCurrency(row.currency ?? 'USD')
              }}>Edit</Button>}
              <Button kind="ghost" onClick={() => remove(row.id)}>Delete</Button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export function TherapistsScreen({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const { rows, error, loading, reload } = useLoad<AdminProfessional>(session, loadAdminProfessionals)
  const queue = new URLSearchParams(window.location.search).get('queue')
  const [q, setQ] = useState('')
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((row) => {
    if (queue === 'hidden' && row.active) return false
    if (queue === 'incomplete' && (row.professional_services ?? []).length > 0 && (row.professional_cities ?? []).length > 0) return false
    if (needle && !row.display_name.toLowerCase().includes(needle)) return false
    return true
  })
  const hint = queue === 'hidden' ? 'Hidden until you publish them.' : queue === 'incomplete' ? 'Missing a service or a city.' : 'Published profiles appear in client search. Hidden ones do not.'
  return (
    <div className="page stack">
      <header className="page-head"><h1>Professionals</h1><p>{hint}</p></header>
      <Field label="Search"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name" /></Field>
      {shown.length === 0 ? <EmptyBlock title="No professionals" text="Nobody matches this view. New professionals stay hidden until you activate them." /> : (
        <div className="catalog-grid">
          {shown.map((row) => (
            <button type="button" className="catalog-card" key={row.id} onClick={() => onOpen(row.id)}>
              <strong>{row.display_name}</strong>
              <span>{row.active ? 'Published' : 'Hidden'}</span>
              <span>{(row.professional_services ?? []).length === 1 ? '1 service' : `${(row.professional_services ?? []).length} services`} · {(row.professional_cities ?? []).length === 1 ? '1 city' : `${(row.professional_cities ?? []).length} cities`}</span>
            </button>
          ))}
        </div>
      )}
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
  const [squareToken, setSquareToken] = useState('')
  const [application, setApplication] = useState<Awaited<ReturnType<typeof listPartnerApplications>>[number] | null>(null)
  const [steps, setSteps] = useState<Awaited<ReturnType<typeof loadProfessionalSteps>>>([])
  const [order, setOrder] = useState<Awaited<ReturnType<typeof loadCalendarOrder>>>([])
  const [termsOn, setTermsOn] = useState<string | null>(null)
  const [hours, setHours] = useState<Awaited<ReturnType<typeof loadHours>>>([])
  const [blocks, setBlocks] = useState<Awaited<ReturnType<typeof loadBlocks>>>([])
  const [windows, setWindows] = useState<{ weekday: number; start: string; end: string }[]>([])
  const [timezone, setTimezone] = useState('America/New_York')
  const [slot, setSlot] = useState(60)
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('12:00')
  const [blockEnd, setBlockEnd] = useState('13:00')

  function reload() {
    setLoading(true)
    Promise.all([
      loadAdminProfessionals(session),
      loadServices(session),
      loadCities(session),
      loadSpecialties(session),
      listPartnerApplications(session).catch(() => []),
      loadProfessionalSteps(session),
      loadCalendarOrder(session),
      loadTermsAdmin(session),
      loadHours(session, id),
      loadBlocks(session, id),
    ])
      .then(([people, nextServices, nextCities, nextSpecialties, applications, nextSteps, nextOrder, terms, nextHours, nextBlocks]) => {
        const person = people.find((item) => item.id === id) ?? null
        setRow(person)
        setServices(nextServices)
        setCities(nextCities)
        setSpecialties(nextSpecialties)
        setApplication(person ? applications.find((item) => item.profile_id === person.profile_id) ?? null : null)
        setSteps(nextSteps.filter((item) => item.professional_id === id))
        setOrder(nextOrder.filter((item) => item.professional_id === id).sort((a, b) => a.position - b.position))
        const published = terms.versions.filter((item) => item.status === 'published').sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]
        const acceptance = published ? terms.acceptances.find((item) => item.professional_id === id && item.version_number === published.version_number) : undefined
        setTermsOn(acceptance?.accepted_at ?? null)
        setHours(nextHours)
        setBlocks(nextBlocks)
        setWindows(nextHours.map((hour) => ({
          weekday: hour.weekday,
          start: minuteLabel(hour.start_minute),
          end: minuteLabel(hour.end_minute),
        })))
        if (person) {
          setTimezone(person.schedule_timezone)
          setSlot(person.slot_minutes)
        }
        const connection = person?.schedule_connections?.find((item) => item.provider === 'acuity')
        setTypeId(connection?.external_resource_id ?? '')
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the professional.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session, id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('square')
    if (!result) return
    const messages: Record<string, string> = {
      connected: 'Square is connected. It stays pending until a live booking is completed.',
      choose: 'This Square account has more than one location, person, or service. The professional picks them on Agenda.',
      incomplete: 'Square still needs a location, a team member, and a bookable service.',
      denied: 'Square sign-in was cancelled.',
      error: 'Square sign-in did not finish.',
    }
    if (messages[result]) setNotice(messages[result])
    params.delete('square')
    const next = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${next ? `?${next}` : ''}`)
  }, [])

  if (loading) return <div className="page"><LoadingBlock kind="form" text="Loading this profile…" /></div>
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
    const wantsActive = form.get('active') === 'on'
    if (wantsActive && (serviceIds.size === 0 || cityIds.size === 0)) {
      setNotice('Add a service and a city before publishing this profile.')
      return
    }
    try {
      await patchRow(session, 'professionals', current.id, {
        display_name: String(form.get('display_name') || '').trim(),
        bio: String(form.get('bio') || '').trim() || null,
        active: wantsActive,
        portrait_path: String(form.get('portrait') || '') || null,
      })
      setNotice(wantsActive ? 'Profile saved. Clients can find this professional.' : 'Profile saved. Hidden professionals stay off the client search.')
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

  const canPublish = serviceIds.size > 0 && cityIds.size > 0
  const profileStep = steps.find((item) => item.step === 'profile')
  const calendarStep = steps.find((item) => item.step === 'calendar')

  return (
    <div className="page stack">
      <PaymentSetupCard session={session} professionalId={id} />
      <form className="account-card" key={`${row.updated_at}-${row.bio ?? ''}-${row.active}`} onSubmit={saveProfile}>
        <h2>{row.display_name}</h2>
        <p className="muted">{row.active ? 'Published' : 'Hidden'}</p>
        <Field label="Display name"><input name="display_name" defaultValue={row.display_name} required /></Field>
        <Field label="Bio"><textarea name="bio" defaultValue={row.bio ?? ''} rows={4} /></Field>
        <label className="check-row">
          <input name="active" type="checkbox" defaultChecked={row.active} disabled={!canPublish && !row.active} />
          Published on the client search
        </label>
        {!canPublish ? <p className="muted">{row.active ? 'This profile is published without a service or a city. You can hide it. Publishing again needs both.' : 'Add a service and a city before publishing.'}</p> : null}
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
        <h2>Entry</h2>
        <p>Profile {profileStep ? new Date(profileStep.completed_at).toLocaleString() : 'not finished'}</p>
        <p>Calendar {calendarStep ? new Date(calendarStep.completed_at).toLocaleString() : 'not finished'}</p>
        <p>Current terms {termsOn ? `accepted ${new Date(termsOn).toLocaleString()}` : 'not accepted'}</p>
      </section>
      <section className="account-card">
        <h2>Application</h2>
        {application ? (
          <>
            <p>{application.full_name || application.email}</p>
            <p>{application.email}</p>
            <p>Born {application.birth_date}</p>
            {genderLabel(application.gender) ? <p>{genderLabel(application.gender)}</p> : null}
            <p>{application.phone}</p>
            <p>{application.address_line}, {application.city_name} {application.region} {application.postal_code}</p>
            {application.instagram ? <p>{application.instagram}</p> : null}
            <p>{application.specialty_note}</p>
            <p>{application.coverage_note}</p>
            <p className="muted">Terms on the application {new Date(application.terms_accepted_at).toLocaleString()}. Publishing still uses the checkbox above.</p>
          </>
        ) : <p className="muted">No application was submitted for this account.</p>}
      </section>
      <section className="account-card">
        <h2>Services</h2>
        <div className="check-row">
          {services.map((item) => (
            <label key={item.id}><input type="checkbox" checked={serviceIds.has(item.id)} onChange={() => toggle('professional_services', 'service_id', serviceIds, item.id)} />{item.name}{item.price_cents != null && item.currency ? ` · ${item.currency} ${(item.price_cents / 100).toFixed(2)}` : ''}</label>
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
      <section className="account-card">
        <h2>Calendar</h2>
        <p className="muted">Mode {row.schedule_mode ?? 'not chosen'}. You can edit this professional's hours. You cannot reorder their calendars.</p>
        {order.length === 0 ? <p className="muted">No saved order.</p> : <p>Order: {order.map((item) => `${item.position}. ${item.calendar_key}`).join(' · ')}</p>}
        {(row.schedule_connections ?? []).map((item) => (
          <p key={item.id}>{item.provider} · {item.status}{item.is_source ? ' · marked source' : ''}{item.external_resource_id ? ` · ${item.external_resource_id}` : ''}</p>
        ))}
        <form className="stack" onSubmit={async (event) => {
          event.preventDefault()
          const next = windows.flatMap((window) => {
            const start = timeToMinutes(window.start)
            const end = timeToMinutes(window.end)
            if (start == null || end == null || end <= start) return []
            return [{ weekday: window.weekday, start_minute: start, end_minute: end }]
          })
          try {
            await patchRow(session, 'professionals', current.id, { schedule_timezone: timezone, slot_minutes: slot })
            await replaceHours(session, current.id, next)
            setNotice('Weekly hours saved.')
            reload()
          } catch (caught) {
            setNotice(caught instanceof Error ? caught.message : 'Could not save the hours.')
          }
        }}>
          <Field label="Time zone">
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </Field>
          <Field label="Appointment length">
            <select value={slot} onChange={(event) => setSlot(Number(event.target.value))}>
              {LENGTHS.map((length) => <option key={length} value={length}>{length} minutes</option>)}
            </select>
          </Field>
          {windows.map((window, index) => (
            <div className="check-row" key={`${window.weekday}-${index}`}>
              <select value={window.weekday} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item))}>
                {WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="time" value={window.start} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} required />
              <input type="time" value={window.end} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} required />
              <Button kind="ghost" onClick={() => setWindows(windows.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
            </div>
          ))}
          <Button kind="ghost" onClick={() => setWindows([...windows, { weekday: 1, start: '09:00', end: '17:00' }])}>Add window</Button>
          <Button type="submit">Save hours</Button>
        </form>
        <form className="stack" onSubmit={async (event) => {
          event.preventDefault()
          if (!blockDate) return
          try {
            await addBlock(session, current.id, zonedInstant(blockDate, blockStart, timezone), zonedInstant(blockDate, blockEnd, timezone))
            setNotice('Block saved.')
            reload()
          } catch (caught) {
            setNotice(caught instanceof Error ? caught.message : 'Could not save the block.')
          }
        }}>
          <h3>Blocks</h3>
          <Field label="Date"><input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} required /></Field>
          <Field label="From"><input type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} required /></Field>
          <Field label="To"><input type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} required /></Field>
          <Button type="submit">Add block</Button>
          {blocks.map((block) => (
            <p key={block.id}>{new Date(block.starts_at).toLocaleString()} <Button kind="ghost" onClick={() => removeBlock(session, block.id).then(() => reload())}>Remove</Button></p>
          ))}
          {hours.length === 0 ? <p className="muted">No weekly hours yet.</p> : null}
        </form>
      </section>
      <form className="account-card" onSubmit={async (event) => {
        event.preventDefault()
        try {
          const result = await callFunction(session, 'scheduling-square', {
            action: 'connect',
            professional_id: current.id,
            environment: 'sandbox',
            access_token: squareToken,
          })
          const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : {}
          if (body.status === 'choose') {
            setNotice('This Square account has more than one location, person, or service. The professional picks them on Agenda.')
            return
          }
          if (!body.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Square did not connect.')
          setSquareToken('')
          setNotice(body.status === 'tested'
            ? 'Square connected. The token is not shown again.'
            : 'Square connected. The token is not shown again. Status stays pending until a live booking.')
          reload()
        } catch (caught) {
          setNotice(caught instanceof Error ? caught.message : 'Could not connect Square.')
        }
      }}>
        <h2>Square</h2>
        <p>Status: {current.schedule_connections?.find((item) => item.provider === 'square')?.status ?? 'not connected'}. The professional signs in from Agenda. This form only saves a sandbox access token for operation.</p>
        <Field label="Sandbox access token"><input value={squareToken} onChange={(event) => setSquareToken(event.target.value)} type="password" autoComplete="off" required /></Field>
        <Button type="submit" disabled={squareToken.trim() === ''}>Save sandbox token</Button>
        <Button kind="ghost" onClick={async () => {
          try {
            const result = await callFunction(session, 'scheduling-square', { action: 'disconnect', professional_id: current.id })
            const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : {}
            setNotice(body.revoked === true
              ? 'Square is disconnected here and the sign-in was revoked.'
              : 'Square is disconnected here.')
            reload()
          } catch (caught) {
            setNotice(caught instanceof Error ? caught.message : 'Could not disconnect Square.')
          }
        }}>Disconnect Square</Button>
      </form>
      <form className="account-card" onSubmit={saveConnection}>
        <h2>Acuity</h2>
        <p>Status: {connection?.status ?? 'not connected'}. Homologated is not a choice on this form.</p>
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
