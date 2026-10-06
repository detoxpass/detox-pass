import { useEffect, useState, type FormEvent } from 'react'
import {
  listAccounts,
  loadAdminBookings,
  loadAdminProfessionals,
  loadAttendance,
  loadCalendarOrder,
  loadFinanceReport,
  loadMarketplaceSettings,
  loadNotices,
  loadProfessionalSteps,
  loadRewardGrants,
  loadRewardRules,
  loadTermsAdmin,
  patchRow,
  type AccountRow,
  type AdminProfessional,
  type BookingRow,
  type CalendarOrderRow,
  type FinanceRow,
  type Notice as AppNotice,
  type ProfessionalStep,
  type Session,
} from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, Field, LoadingBlock, Notice } from '../../ui'

function money(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

function useQuery() {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search))
  function set(key: string, value: string) {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    const search = next.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`)
    setQuery(next)
  }
  return { query, set }
}

export function AdminHome({ session, go }: { session: Session; go: (path: string) => void }) {
  const [people, setPeople] = useState<AdminProfessional[]>([])
  const [steps, setSteps] = useState<ProfessionalStep[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [notices, setNotices] = useState<AppNotice[]>([])
  const [missingTerms, setMissingTerms] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    setError('')
    Promise.all([
      loadAdminProfessionals(session),
      loadProfessionalSteps(session),
      loadAdminBookings(session),
      loadAttendance(session),
      loadNotices(session),
      loadTermsAdmin(session),
    ]).then(([nextPeople, nextSteps, nextBookings, attendance, nextNotices, terms]) => {
      setPeople(nextPeople)
      setSteps(nextSteps)
      setBookings(nextBookings)
      setConfirmed(new Set(attendance.map((row) => row.booking_id)))
      setNotices(nextNotices.filter((row) => !row.read_at))
      const published = terms.versions.filter((row) => row.status === 'published').sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]
      if (!published?.version_number) setMissingTerms(0)
      else {
        const accepted = new Set(terms.acceptances.filter((row) => row.version_number === published.version_number).map((row) => row.professional_id))
        setMissingTerms(nextPeople.filter((person) => !accepted.has(person.id)).length)
      }
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the desk.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  if (loading) return <div className="page"><LoadingBlock text="Loading the desk…" /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>

  const calendarDone = new Set(steps.filter((step) => step.step === 'calendar').map((step) => step.professional_id))
  const queues = [
    { label: 'Waiting to publish', count: people.filter((person) => !person.active).length, href: '/admin/therapists?queue=hidden' },
    { label: 'Catalog incomplete', count: people.filter((person) => (person.professional_services ?? []).length === 0 || (person.professional_cities ?? []).length === 0).length, href: '/admin/therapists?queue=incomplete' },
    { label: 'Terms still open', count: missingTerms, href: '/admin/terms?queue=missing' },
    { label: 'Calendar pending', count: people.filter((person) => (person.schedule_connections ?? []).some((item) => item.status === 'pending') || !calendarDone.has(person.id)).length, href: '/admin/calendars?queue=pending' },
    { label: 'Needs review', count: bookings.filter((row) => row.saga_status === 'compensation_required').length, href: '/admin/booking?saga=compensation_required' },
    { label: 'Visit confirmed', count: bookings.filter((row) => row.saga_status === 'paid' && confirmed.has(row.id)).length, href: '/admin/booking?queue=confirmed' },
    { label: 'Unread notices', count: notices.length, href: '/notifications' },
  ]

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Home</h1>
        <p>Counts come from the rows that exist. A zero is a zero.</p>
      </header>
      <div className="admin-queues">
        {queues.map((queue) => (
          <button type="button" className="catalog-card admin-queue" key={queue.href} onClick={() => go(queue.href)}>
            <strong>{queue.count}</strong>
            <span>{queue.label}</span>
          </button>
        ))}
      </div>
      <section className="account-card">
        <h2>Unread</h2>
        {notices.length === 0 ? <p className="muted">No unread notices.</p> : notices.slice(0, 6).map((notice) => (
          <button type="button" className="catalog-card" key={notice.id} onClick={() => go(notice.href || '/notifications')}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </button>
        ))}
      </section>
    </div>
  )
}

export function PeopleHub({ go }: { go: (path: string) => void }) {
  const links = [
    ['/admin/therapists', 'Professionals', 'Publish a profile, edit the catalog links, and read the application.'],
    ['/admin/clients', 'Clients', 'Name, email, and the reservations on this account.'],
    ['/admin/users', 'Accounts', 'Search people and change a role. The new role applies at the next sign-in.'],
  ]
  return (
    <div className="page stack">
      <header className="page-head">
        <h1>People</h1>
        <p>Professionals, clients, and accounts.</p>
      </header>
      {links.map(([href, title, text]) => (
        <button type="button" className="catalog-card" key={href} onClick={() => go(href)}>
          <strong>{title}</strong>
          <span>{text}</span>
        </button>
      ))}
    </div>
  )
}

export function ClientsScreen({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  function reload() {
    setLoading(true)
    listAccounts(session)
      .then((next) => setRows(next.filter((row) => row.role === 'cliente')))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load clients.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session])
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((row) => !needle || `${row.full_name ?? ''} ${row.email}`.toLowerCase().includes(needle))
  return (
    <div className="page stack">
      <header className="page-head"><h1>Clients</h1><p>Accounts with the client role.</p></header>
      <Field label="Search"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name or email" /></Field>
      {shown.length === 0 ? <EmptyBlock title="No clients" text="Client accounts show up here after they sign up." /> : shown.map((row) => (
        <button type="button" className="catalog-card" key={row.id} onClick={() => onOpen(row.id)}>
          <strong>{row.full_name || row.email}</strong>
          <span>{row.email}</span>
        </button>
      ))}
    </div>
  )
}

export function ClientEditor({ session, id }: { session: Session; id: string }) {
  const [account, setAccount] = useState<AccountRow | null>(null)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    Promise.all([listAccounts(session), loadAdminBookings(session)])
      .then(([accounts, nextBookings]) => {
        setAccount(accounts.find((row) => row.id === id && row.role === 'cliente') ?? null)
        setBookings(nextBookings.filter((row) => row.client_id === id))
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this client.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session, id])
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  if (!account) return <div className="page"><EmptyBlock title="Client not found" text="This account is not a client." /></div>
  return (
    <div className="page stack">
      <article className="account-card">
        <h2>{account.full_name || account.email}</h2>
        <p>{account.email}</p>
        <p className="muted">Client. This screen does not open their chat and does not delete the account.</p>
      </article>
      <section className="account-card">
        <h2>Reservations</h2>
        {bookings.length === 0 ? <p className="muted">No reservations on this account.</p> : bookings.map((row) => (
          <p key={row.id}>{row.services?.name || 'Service'} · {row.cities?.name || 'City'} · {row.saga_status}</p>
        ))}
      </section>
    </div>
  )
}

export function CalendarsScreen({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const { query } = useQuery()
  const pendingOnly = query.get('queue') === 'pending'
  const [people, setPeople] = useState<AdminProfessional[]>([])
  const [order, setOrder] = useState<CalendarOrderRow[]>([])
  const [steps, setSteps] = useState<ProfessionalStep[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    Promise.all([loadAdminProfessionals(session), loadCalendarOrder(session), loadProfessionalSteps(session)])
      .then(([nextPeople, nextOrder, nextSteps]) => {
        setPeople(nextPeople)
        setOrder(nextOrder)
        setSteps(nextSteps)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load calendars.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session])
  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>

  const calendarDone = new Set(steps.filter((step) => step.step === 'calendar').map((step) => step.professional_id))
  const shown = people.filter((person) => {
    if (!pendingOnly) return true
    return (person.schedule_connections ?? []).some((item) => item.status === 'pending') || !calendarDone.has(person.id)
  })

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Calendars</h1>
        <p>{pendingOnly ? 'Pending connections, or a calendar step still open.' : 'Connected calendars and the internal grid. The order is read only.'}</p>
      </header>
      {shown.length === 0 ? <EmptyBlock title="Nothing in this list" text="No professional matches this view." /> : shown.map((person) => {
        const rank = order.filter((item) => item.professional_id === person.id).sort((a, b) => a.position - b.position)
        return (
          <article className="account-card" key={person.id}>
            <button type="button" className="text-link" onClick={() => onOpen(person.id)}>{person.display_name}</button>
            <p className="muted">Mode {person.schedule_mode ?? 'not chosen'} · {person.schedule_timezone} · {person.slot_minutes} min</p>
            {person.schedule_mode === 'internal' ? <p>Internal calendar {calendarDone.has(person.id) ? 'step finished' : 'step open'}</p> : null}
            {(person.schedule_connections ?? []).length === 0 ? <p className="muted">No partner calendar connected.</p> : (person.schedule_connections ?? []).map((item) => (
              <p key={item.id}>{item.provider} · {item.status}{item.is_source ? ' · marked source' : ''}{item.external_resource_id ? ` · ${item.external_resource_id}` : ''}</p>
            ))}
            {rank.length > 0 ? <p>Order: {rank.map((item) => `${item.position}. ${item.calendar_key}`).join(' · ')}</p> : <p className="muted">No saved order.</p>}
          </article>
        )
      })}
    </div>
  )
}

export function MoneyScreen({ session }: { session: Session }) {
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [settings, setSettings] = useState<{ commission_bps: number; currency: string | null } | null>(null)
  const [percent, setPercent] = useState('20')
  const [currency, setCurrency] = useState('')
  const [professional, setProfessional] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    setError('')
    Promise.all([loadFinanceReport(session), loadAdminBookings(session), loadMarketplaceSettings(session)])
      .then(([report, nextBookings, nextSettings]) => {
        setRows(report)
        setBookings(nextBookings)
        setSettings(nextSettings)
        if (nextSettings) {
          setPercent(String(nextSettings.commission_bps / 100))
          setCurrency(nextSettings.currency ?? '')
        }
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load money.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session])

  async function save(event: FormEvent) {
    event.preventDefault()
    const rate = Number(percent)
    const bps = Math.round(rate * 100)
    const nextCurrency = currency.trim().toUpperCase()
    if (!Number.isInteger(rate) || rate < 0 || rate > 100 || bps < 0 || bps > 10000) {
      setNotice('Commission has to be a whole percent from 0 to 100.')
      return
    }
    if (!/^[A-Z]{3}$/.test(nextCurrency)) {
      setNotice('Currency has to be three capital letters.')
      return
    }
    try {
      await patchRow(session, 'marketplace_settings', '1', { commission_bps: bps, currency: nextCurrency })
      setNotice('Saved. This rate applies to the next charge that reaches paid. Rows already in the report stay as they are.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save settings.')
    }
  }

  if (loading) return <div className="page"><LoadingBlock text="Loading the report…" /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  const byId = new Map(bookings.map((row) => [row.id, row]))
  const professionals = [...new Map(bookings.map((row) => [row.professional_id, row.professionals?.display_name || 'Therapist'])).entries()]
  const shown = rows.filter((row) => {
    const booking = byId.get(row.booking_id)
    if (currencyFilter && row.currency !== currencyFilter) return false
    if (professional && booking?.professional_id !== professional) return false
    return true
  })
  const currencies = [...new Set(rows.map((row) => row.currency))]

  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Money</h1>
        <p>Paid, commission, pending, and released, from the finance report. No chart.</p>
      </header>
      <section className="account-card">
        <h2>Report</h2>
        <div className="admin-filters">
          <Field label="Currency">
            <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
              <option value="">All</option>
              {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Professional">
            <select value={professional} onChange={(event) => setProfessional(event.target.value)}>
              <option value="">All</option>
              {professionals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
        </div>
        {shown.length === 0 ? <EmptyBlock title="No financial rows" text="The report stays empty until a charge is recorded. Nothing here is an estimate." /> : (
          <div className="stack">
            {shown.map((row) => {
              const booking = byId.get(row.booking_id)
              return (
                <article className="catalog-card" key={row.booking_id}>
                  <strong>{booking?.professionals?.display_name || 'Reservation'}</strong>
                  <span>{booking?.services?.name || 'Service'} · {row.currency}</span>
                  <span>Paid {money(row.paid_cents, row.currency)}</span>
                  <span>Commission {money(row.commission_cents, row.currency)}</span>
                  <span>Pending {money(row.pending_cents, row.currency)}</span>
                  <span>Released {money(row.released_cents, row.currency)}</span>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <form className="account-card" onSubmit={save}>
        <h2>Settings</h2>
        <p className="muted">The new commission applies to the next charge that reaches paid. A row already in the report keeps the commission it was given.</p>
        <p className="muted">Current rate {settings ? `${settings.commission_bps / 100}%` : 'unknown'}{settings?.currency ? ` · ${settings.currency}` : ''}.</p>
        <Field label="Commission percent"><input inputMode="numeric" value={percent} onChange={(event) => setPercent(event.target.value)} required /></Field>
        <Field label="Currency"><input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required /></Field>
        <Button type="submit">Save settings</Button>
        {notice ? <Notice text={notice} /> : null}
      </form>
    </div>
  )
}

export function RewardsScreen({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const [rule, setRule] = useState<{ id: string; active: boolean } | null>(null)
  const [grants, setGrants] = useState<Awaited<ReturnType<typeof loadRewardGrants>>>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    Promise.all([loadRewardRules(session), loadRewardGrants(session)])
      .then(([rules, nextGrants]) => {
        const match = rules.find((item) => item.code === 'confirmed_session') ?? null
        setRule(match)
        setGrants(nextGrants)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load rewards.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { reload() }, [session])

  async function toggle() {
    if (!rule) return
    try {
      await patchRow(session, 'reward_rules', rule.id, { active: !rule.active })
      setNotice(rule.active ? 'Confirmed visits will not grant a reward.' : 'Confirmed visits can grant a reward again.')
      reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not update the rule.')
    }
  }

  if (loading) return <div className="page"><LoadingBlock /></div>
  if (error) return <div className="page"><ErrorBlock text={error} onRetry={reload} /></div>
  return (
    <div className="page stack">
      <header className="page-head">
        <h1>Rewards</h1>
        <p>A grant does not pay the professional and does not release a payout.</p>
      </header>
      <section className="account-card">
        <h2>Confirmed visit</h2>
        {rule ? (
          <label className="check-row">
            <input type="checkbox" checked={rule.active} onChange={toggle} />
            {rule.active ? 'On' : 'Off'}
          </label>
        ) : <p className="muted">The confirmed visit rule is not in the database.</p>}
        {notice ? <Notice text={notice} /> : null}
      </section>
      <section className="account-card">
        <h2>Grants</h2>
        {grants.length === 0 ? <EmptyBlock title="No grants" text="A grant appears after a client confirms a paid visit." /> : grants.map((grant) => (
          <button type="button" className="catalog-card" key={grant.id} onClick={() => onOpen(grant.booking_id)}>
            <strong>{grant.professionals?.display_name || 'Professional'}</strong>
            <span>{new Date(grant.created_at).toLocaleString()}</span>
          </button>
        ))}
      </section>
    </div>
  )
}
