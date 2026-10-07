import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { readLoved, writeLoved } from '../../lib/loved'
import { authorizePayout, calendarDoor, callFunction, loadAdminBookings, loadAttendance, loadBookingEvents, loadBookings, loadFinanceReport, type BookingEvent, type BookingRow, type Session } from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, Icon, LoadingBlock, Notice, SagaStatus } from '../../ui'
import { DateStep, TimeStep } from './BookingPanel'
import { appointmentParts, formatWhen, monthOf, shiftMonth } from './when'

const eventLabels: Record<string, string> = {
  intent_opened: 'Reservation started',
  provider_confirmed: 'Time reserved',
  cancelled: 'Reservation cancelled',
  rescheduled: 'Time changed',
  charge_created: 'Charge started',
  paid: 'Marked paid',
  compensation_required: 'Needs review',
  payout_released: 'Payout released',
}

function eventLabel(type: string) {
  return eventLabels[type] ?? type.replaceAll('_', ' ')
}

function datesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('dates' in body) || !Array.isArray(body.dates)) return []
  return body.dates.filter((item): item is string => typeof item === 'string')
}

function photoOf(row: BookingRow) {
  return row.professionals?.portrait_path || '/people/splash.jpg'
}

function lengthOf(start: string, end?: string) {
  if (!end) return ''
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : ''
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}

function payShort(row: BookingRow) {
  if (row.amount_cents == null) return 'Not taken yet'
  if (row.currency) return money(row.amount_cents, row.currency)
  return 'Recorded'
}

function sessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function timesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('times' in body) || !Array.isArray(body.times)) return []
  return body.times.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('time' in item) || typeof item.time !== 'string') return []
    return [item.time]
  })
}

export function SessionList({ session, title, hint, bare = false, ops = false, onOpen }: {
  session: Session
  title: string
  hint: string
  bare?: boolean
  ops?: boolean
  onOpen: (id: string) => void
}) {
  const [rows, setRows] = useState<BookingRow[]>([])
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(() => new URLSearchParams(window.location.search))
  const [page, setPage] = useState(0)
  const [showUpcoming, setShowUpcoming] = useState(false)
  const [showPast, setShowPast] = useState(false)

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    const search = next.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`)
    setFilters(next)
  }

  useEffect(() => {
    let alive = true
    const load = ops ? loadAdminBookings(session) : loadBookings(session)
    const attendance = ops ? loadAttendance(session) : Promise.resolve([])
    Promise.all([load, attendance])
      .then(([next, visits]) => {
        if (!alive) return
        setRows(next)
        setConfirmed(new Set(visits.map((row) => row.booking_id)))
      })
      .catch((caught: unknown) => { if (alive) setError(caught instanceof Error ? caught.message : 'Could not load sessions.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session, ops])

  const shown = rows.filter((row) => {
    if (!ops) return true
    const saga = filters.get('saga')
    const provider = filters.get('provider')
    const professional = filters.get('professional')
    const city = filters.get('city')
    const service = filters.get('service')
    const from = filters.get('from')
    const to = filters.get('to')
    if (filters.get('queue') === 'confirmed' && !(row.saga_status === 'paid' && confirmed.has(row.id))) return false
    if (saga && row.saga_status !== saga) return false
    if (provider && row.provider !== provider) return false
    if (professional && row.professional_id !== professional) return false
    if (city && row.city_id !== city) return false
    if (service && row.service_id !== service) return false
    const day = row.starts_at.slice(0, 10)
    if (from && day < from) return false
    if (to && day > to) return false
    return true
  })
  const professionals = [...new Map(rows.map((row) => [row.professional_id, row.professionals?.display_name || 'Therapist'])).entries()]
  const cities = [...new Map(rows.flatMap((row) => row.city_id ? [[row.city_id, row.cities?.name || 'City'] as const] : [])).entries()]
  const services = [...new Map(rows.flatMap((row) => row.service_id ? [[row.service_id, row.services?.name || 'Service'] as const] : [])).entries()]

  const now = Date.now()
  const upcoming = shown
    .filter((row) => row.saga_status !== 'cancelled' && new Date(row.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const history = shown
    .filter((row) => row.saga_status === 'cancelled' || new Date(row.starts_at).getTime() < now)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const next = upcoming[0]
  const later = upcoming.slice(1)
  const laterShown = showUpcoming ? later : later.slice(0, 5)
  const pastShown = showPast ? history : history.slice(0, 4)
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const historyPage = history.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const body = (
    <>
      {ops || bare ? (
        <header className="page-head">
          <h1>{title}</h1>
          <p>{hint}</p>
        </header>
      ) : null}
      {loading ? <LoadingBlock text="Loading sessions…" /> : null}
      {error ? <ErrorBlock text={error} /> : null}
      {!ops && bare && shown.length > 0 ? (
        <ul className="visit-list">
          {shown.map((row) => <li key={row.id}><VisitButton row={row} ops={false} onOpen={onOpen} /></li>)}
        </ul>
      ) : null}
      {!ops && !bare && !loading && !error && shown.length > 0 ? (
        <>
          {next ? <NextSession row={next} onOpen={onOpen} /> : <EmptyBlock title="No upcoming session" text="A future reservation appears here after the calendar confirms it." />}
          <section className="session-block">
            <div className="sess-head"><h2>Upcoming sessions</h2>{later.length > 5 ? <button type="button" onClick={() => setShowUpcoming((value) => !value)}>{showUpcoming ? 'Show less' : 'See all'} <Icon name="back" /></button> : null}</div>
            {laterShown.length === 0 ? <p className="muted">Other future reservations show up here.</p> : (
              <ul className="sess-list">
                {laterShown.map((row) => <li key={row.id}><SessionRow row={row} onOpen={onOpen} /></li>)}
              </ul>
            )}
          </section>
          <section className="session-block">
            <div className="sess-head"><h2>Past sessions</h2>{history.length > 4 ? <button type="button" onClick={() => setShowPast((value) => !value)}>{showPast ? 'Show less' : 'See all'} <Icon name="back" /></button> : null}</div>
            {history.length === 0 ? <p className="muted">Past and cancelled reservations show up here.</p> : (
              <>
                <ul className="sess-list">
                  {(showPast ? historyPage : pastShown).map((row) => <li key={row.id}><SessionRow row={row} onOpen={onOpen} /></li>)}
                </ul>
                {showPast && pageCount > 1 ? (
                  <div className="session-pages">
                    <Button kind="ghost" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}>Previous</Button>
                    <span>{safePage + 1} / {pageCount}</span>
                    <Button kind="ghost" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>Next</Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
      {ops ? (
        <div className="admin-filters">
          <label className="field"><span>Status</span>
            <select value={filters.get('saga') ?? ''} onChange={(event) => setFilter('saga', event.target.value)}>
              <option value="">All</option>
              {['intent', 'provider_confirmed', 'charge_created', 'paid', 'cancelled', 'compensation_required', 'compensated', 'payout_released'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="field"><span>Calendar</span>
            <select value={filters.get('provider') ?? ''} onChange={(event) => setFilter('provider', event.target.value)}>
              <option value="">All</option>
              {['internal', 'square', 'acuity', 'wix', 'zenoti', 'mindbody'].map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className="field"><span>Professional</span>
            <select value={filters.get('professional') ?? ''} onChange={(event) => setFilter('professional', event.target.value)}>
              <option value="">All</option>
              {professionals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field"><span>City</span>
            <select value={filters.get('city') ?? ''} onChange={(event) => setFilter('city', event.target.value)}>
              <option value="">All</option>
              {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field"><span>Service</span>
            <select value={filters.get('service') ?? ''} onChange={(event) => setFilter('service', event.target.value)}>
              <option value="">All</option>
              {services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field"><span>From</span><input type="date" value={filters.get('from') ?? ''} onChange={(event) => setFilter('from', event.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={filters.get('to') ?? ''} onChange={(event) => setFilter('to', event.target.value)} /></label>
        </div>
      ) : null}
      {!loading && !error && shown.length === 0 ? <EmptyBlock title="No sessions yet" text={ops ? 'Nothing matches these filters.' : 'A reservation appears here after the calendar confirms it.'} /> : null}
      {ops && shown.length > 0 ? (
        <ul className="visit-list">
          {shown.map((row) => <li key={row.id}><VisitButton row={row} ops onOpen={onOpen} /></li>)}
        </ul>
      ) : null}
    </>
  )
  if (bare) return <section className="visit-embed">{body}</section>
  return <div className={ops ? 'page narrow' : 'page sessions-home'}>{body}</div>
}

function sessionStamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: '', day: '', weekday: '', time: '', date: value }
  return {
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date).toUpperCase(),
    day: String(date.getDate()),
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date),
    date: new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date),
  }
}

function NextSession({ row, onOpen }: { row: BookingRow; onOpen: (id: string) => void }) {
  const cityName = row.cities?.name || 'City'
  return (
    <button type="button" className="sd-hero next-hero" onClick={() => onOpen(row.id)}>
      <span className="next-face">
        <span className="sd-shot">
          <img className="sd-photo" src={photoOf(row)} alt="" />
          <span className="sd-chip"><Icon name="pin" /> {cityName}</span>
        </span>
        <span className="sd-id">
          <p className="sd-city"><Icon name="pin" /> {cityName}</p>
          <h1>{row.professionals?.display_name || 'Therapist'}</h1>
          <p>{row.services?.name || 'Service'}</p>
          <SagaStatus status={row.saga_status} />
        </span>
        <Countdown at={row.starts_at} />
      </span>
    </button>
  )
}

function Countdown({ at }: { at: string }) {
  const target = new Date(at).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const left = Number.isFinite(target) ? Math.max(0, target - now) : 0
  const total = Math.floor(left / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const units = days > 0
    ? [{ n: days, label: 'Days' }, { n: hours, label: 'Hrs' }, { n: minutes, label: 'Min' }]
    : [{ n: hours, label: 'Hrs' }, { n: minutes, label: 'Min' }, { n: seconds, label: 'Sec' }]
  return (
    <span className="sd-count">
      <em>{left === 0 ? 'Starting now' : 'Starts in'}</em>
      {left === 0 ? null : (
        <span>
          {units.map((unit) => (
            <span key={unit.label}><b>{String(unit.n).padStart(2, '0')}</b><small>{unit.label}</small></span>
          ))}
        </span>
      )}
    </span>
  )
}

function SessionRow({ row, onOpen }: { row: BookingRow; onOpen: (id: string) => void }) {
  const stamp = sessionStamp(row.starts_at)
  const length = lengthOf(row.starts_at, row.ends_at)
  return (
    <button type="button" className="sess-row" onClick={() => onOpen(row.id)}>
      <span className="sess-date"><small>{stamp.month}</small><b>{stamp.day}</b></span>
      <span className="sess-when">{stamp.weekday} · {stamp.time}</span>
      <img src={photoOf(row)} alt="" />
      <span className="sess-who">
        <strong>{row.professionals?.display_name || 'Therapist'}</strong>
        <span>{[row.services?.name || 'Service', row.cities?.name || 'City', length].filter(Boolean).join(' · ')}</span>
      </span>
      <SagaStatus status={row.saga_status} />
      <Icon name="back" />
    </button>
  )
}

function VisitButton({ row, ops, onOpen }: { row: BookingRow; ops: boolean; onOpen: (id: string) => void }) {
  const when = appointmentParts(row.starts_at)
  return (
    <button type="button" className={`visit-card cal-${row.provider}`} onClick={() => onOpen(row.id)}>
      <img className="visit-photo" src={photoOf(row)} alt="" />
      <span className="visit-when">
        <strong>{when.day}</strong>
        <em>{when.time}</em>
      </span>
      <span className="visit-who">
        <strong>{row.professionals?.display_name || 'Therapist'}</strong>
        <span>{ops && row.client?.full_name ? `${row.client.full_name} · ` : ''}{row.services?.name || 'Service'} · {row.cities?.name || 'City'}</span>
      </span>
      <SagaStatus status={row.saga_status} />
    </button>
  )
}

export function SessionDetail({ session, id, canChange, canRead, ops = false, onBack }: {
  session: Session
  id: string
  canChange: boolean
  canRead: boolean
  ops?: boolean
  onBack: () => void
}) {
  const [rows, setRows] = useState<BookingRow[]>([])
  const [events, setEvents] = useState<BookingEvent[]>([])
  const [confirmedAt, setConfirmedAt] = useState('')
  const [pendingCents, setPendingCents] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [slotsBusy, setSlotsBusy] = useState(false)
  const [nextTime, setNextTime] = useState('')
  const [times, setTimes] = useState<string[]>([])
  const [month, setMonth] = useState(monthOf(new Date()))
  const [dates, setDates] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [datesLoading, setDatesLoading] = useState(false)
  const [pendingCalendar, setPendingCalendar] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveStep, setMoveStep] = useState<'date' | 'time'>('date')
  const [datesReload, setDatesReload] = useState(0)
  const [external, setExternal] = useState('')
  const [loved, setLoved] = useState<string[]>(readLoved)

  function refresh() {
    setLoading(true)
    const bookings = ops ? loadAdminBookings(session) : loadBookings(session)
    const attendance = ops ? loadAttendance(session) : Promise.resolve([])
    const finance = ops ? loadFinanceReport(session).catch(() => []) : Promise.resolve([])
    return Promise.all([bookings, loadBookingEvents(session, id), attendance, finance])
      .then(([bookings, timeline, visits, report]) => {
        setRows(bookings)
        setEvents(timeline)
        setConfirmedAt(visits.find((row) => row.booking_id === id)?.confirmed_at ?? '')
        const line = report.find((row) => row.booking_id === id)
        setPendingCents(line ? line.pending_cents : null)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this session.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { void refresh() }, [session, id, ops])

  const booking = rows.find((row) => row.id === id)
  const door = calendarDoor(booking?.provider)

  useEffect(() => {
    if (!moveOpen) return
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [moveOpen])

  useEffect(() => {
    if (!moveOpen || !canChange || !booking || !door || booking.saga_status !== 'provider_confirmed') return
    let alive = true
    setDatesLoading(true)
    setPendingCalendar(false)
    callFunction(session, door, { action: 'dates', professional_id: booking.professional_id, month })
      .then((result) => {
        if (!alive) return
        if (result.status === 422) {
          setPendingCalendar(true)
          setDates([])
          return
        }
        setDates(datesOf(result.body))
      })
      .catch(() => { if (alive) setDates([]) })
      .finally(() => { if (alive) setDatesLoading(false) })
    return () => { alive = false }
  }, [moveOpen, session, canChange, booking?.professional_id, booking?.saga_status, door, month, datesReload])

  if (loading) return <div className="page narrow"><LoadingBlock kind="detail" text="Loading this session…" /></div>
  if (error && !booking) return <div className="page narrow"><ErrorBlock text={error} onRetry={() => { setError(''); void refresh() }} /></div>
  if (!booking) return <div className="page narrow"><EmptyBlock title="Session not found" text="This reservation is not on your account." /></div>

  const when = appointmentParts(booking.starts_at)
  const open = booking.saga_status === 'provider_confirmed'
  const movePrice = booking.amount_cents != null && booking.currency ? money(booking.amount_cents, booking.currency) : ''
  const moveLength = lengthOf(booking.starts_at, booking.ends_at)
  const client = !ops && canChange
  const canMove = client && open && Boolean(door)
  const saved = loved.includes(booking.professional_id)
  const name = booking.professionals?.display_name || 'Therapist'
  const serviceName = booking.services?.name || 'Service'
  const cityName = booking.cities?.name || 'City'

  function toggleLove() {
    const professionalId = booking?.professional_id
    if (!professionalId) return
    const next = saved ? loved.filter((item) => item !== professionalId) : [...loved, professionalId]
    writeLoved(next)
    setLoved(next)
  }

  function shiftMoveMonth(delta: number) {
    setMonth(shiftMonth(month, delta))
    setDay('')
    setTimes([])
    setNextTime('')
    setMoveStep('date')
  }

  async function cancel() {
    if (!door) return
    setBusy(true)
    setError('')
    try {
      const result = await callFunction(session, door, { action: 'cancel', booking_id: id })
      const body = result.body as { status?: string } | null
      if (body?.status !== 'cancelled') {
        setError('The calendar and the platform did not both cancel.')
        return
      }
      setNotice('Cancelled.')
      setConfirmCancel(false)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel.')
    } finally {
      setBusy(false)
    }
  }

  async function pickDay(next: string) {
    if (!door) return
    setDay(next)
    setNextTime('')
    setTimes([])
    setError('')
    setSlotsBusy(true)
    try {
      const result = await callFunction(session, door, {
        action: 'availability',
        professional_id: booking?.professional_id,
        date: next,
      })
      if (result.status === 422) {
        setPendingCalendar(true)
        return
      }
      setTimes(timesOf(result.body))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load times.')
    } finally {
      setSlotsBusy(false)
    }
  }

  async function reschedule() {
    if (!door) return
    setBusy(true)
    setError('')
    try {
      const result = await callFunction(session, door, { action: 'reschedule', booking_id: id, starts_at: nextTime })
      const body = result.body as { status?: string } | null
      if (body?.status !== 'provider_confirmed') {
        setError('The calendar and the platform did not both change the time.')
        return
      }
      setNotice('Moved. Payment is not part of this step.')
      setMoveOpen(false)
      setNextTime('')
      setDay('')
      setTimes([])
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reschedule.')
    } finally {
      setBusy(false)
    }
  }

  async function readExternal() {
    if (!door) return
    setBusy(true)
    setExternal('')
    try {
      const result = await callFunction(session, door, { action: 'read', booking_id: id })
      const body = result.body as { supported?: boolean; diverged?: boolean; external_starts_at?: string | null; external_canceled?: boolean } | null
      if (body?.supported === false || result.status === 422) {
        setPendingCalendar(true)
        return
      }
      setExternal(body?.diverged
        ? `The calendar differs. Time there: ${body.external_starts_at ? formatWhen(body.external_starts_at) : 'unknown'}. Canceled there: ${body.external_canceled ? 'yes' : 'no'}.`
        : 'The calendar matches this reservation.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the calendar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`page visit-page${canMove ? ' has-dock' : ''}`}>
      <button type="button" className="back sd-back" onClick={onBack}><Icon name="back" /> {client ? 'Back to sessions' : 'Back'}</button>
      <article className="sd-hero">
        <div className="sd-shot">
          <img className="sd-photo" src={photoOf(booking)} alt="" />
          <span className="sd-chip"><Icon name="pin" /> {cityName}</span>
          {client ? (
            <button type="button" className={`sd-heart${saved ? ' on' : ''}`} aria-pressed={saved} aria-label={saved ? `Remove ${name} from favorites` : `Save ${name}`} onClick={toggleLove}><Icon name="heart" /></button>
          ) : null}
        </div>
        <div className="sd-id">
          <p className="sd-city"><Icon name="pin" /> {cityName}</p>
          <h1>{name}</h1>
          <p>{serviceName}</p>
          <SagaStatus status={booking.saga_status} />
        </div>
        {canMove ? (
          <div className="sd-side">
            {confirmCancel ? (
              <div className="confirm-box">
                <p>Cancel this reservation? Payment is not connected, so this does not refund anything.</p>
                <div className="visit-actions">
                  <Button kind="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep it</Button>
                  <Button disabled={busy} onClick={cancel}>Cancel reservation</Button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className="sd-reschedule" disabled={busy} onClick={() => { setMoveStep('date'); setMoveOpen(true) }}><Icon name="calendar" /> Reschedule</button>
                <button type="button" className="sd-cancel" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel reservation</button>
              </>
            )}
          </div>
        ) : null}
      </article>
      {canChange && open && !door ? <p className="muted">This calendar is not connected yet. Nothing was changed.</p> : null}
      <dl className="sd-facts">
        <div><Mark name="calendar" /><span><em>Date</em><strong>{sessionDate(booking.starts_at)}</strong></span></div>
        <div><Mark name="clock" /><span><em>Time</em><strong>{when.time || 'Time not set'}</strong></span></div>
        {moveLength ? <div><Mark name="length" /><span><em>Length</em><strong>{moveLength}</strong></span></div> : null}
        <div><Mark name="user" /><span><em>Service</em><strong>{serviceName}</strong></span></div>
        <div><Mark name="pin" /><span><em>City</em><strong>{cityName}</strong></span></div>
        <div><Mark name="card" /><span><em>Payment</em><strong>{payShort(booking)}</strong></span>{booking.amount_cents == null ? <i className="sd-tip" title="Payment is not taken on this reservation.">i</i> : null}</div>
        {ops && booking.client?.full_name ? <div><Mark name="user" /><span><em>Client</em><strong>{booking.client.full_name}</strong></span></div> : null}
        {ops ? <div><Mark name="calendar" /><span><em>Calendar</em><strong>{booking.provider}</strong></span></div> : null}
        {ops && confirmedAt ? <div><Mark name="clock" /><span><em>Visit confirmed</em><strong>{formatWhen(confirmedAt)}</strong></span></div> : null}
        {ops && booking.external_charge_ref ? <div><Mark name="card" /><span><em>Charge reference</em><strong>{booking.external_charge_ref}</strong></span></div> : null}
      </dl>
      <div className="sd-split">
        <section className="sd-card sd-notes">
          <h2><Mark name="file" /> Session details</h2>
          <ul>
            <li><Mark name="info" /><span>Payment is not taken on this reservation.</span></li>
            <li><Mark name="calendar" /><span>The current time stays until the calendar accepts a change.</span></li>
            <li><Mark name="close" /><span>Cancelling does not refund anything, because payment is not connected.</span></li>
          </ul>
        </section>
        <section className="sd-card">
          <h2><Mark name="note" /> What happened</h2>
          {events.length === 0 ? <p className="muted">Changes will be listed here.</p> : (
            <ol className="sd-timeline">
              {events.map((event) => {
                const moved = event.from_starts_at && event.to_starts_at && event.from_starts_at !== event.to_starts_at
                return (
                  <li key={event.id}>
                    <i>✓</i>
                    <div>
                      <strong>{eventLabel(event.event_type)}</strong>
                      <time dateTime={event.created_at}>{formatWhen(event.created_at)}</time>
                      {moved ? <span>{formatWhen(event.from_starts_at || '')} to {formatWhen(event.to_starts_at || '')}</span> : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
      {canMove ? (
        <div className="sd-dock">
          {confirmCancel ? (
            <div className="confirm-box">
              <p>Cancel this reservation? Payment is not connected, so this does not refund anything.</p>
              <div className="visit-actions">
                <Button kind="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep it</Button>
                <Button disabled={busy} onClick={cancel}>Cancel reservation</Button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="sd-cancel" disabled={busy} onClick={() => setConfirmCancel(true)}><Icon name="close" /> Cancel</button>
              <button type="button" className="sd-reschedule" disabled={busy} onClick={() => { setMoveStep('date'); setMoveOpen(true) }}><Icon name="calendar" /> Reschedule</button>
            </>
          )}
        </div>
      ) : null}
      {moveOpen ? createPortal(
        <div className="book-back" role="presentation" onClick={() => { if (!busy) setMoveOpen(false) }}>
          <div className="book-sheet book-reserve" role="dialog" aria-modal="true" aria-labelledby="move-title" onClick={(event) => event.stopPropagation()}>
            <header className="book-head">
              {moveStep === 'time' ? (
                <button type="button" className="book-icon book-back-btn" aria-label="Back" onClick={() => setMoveStep('date')}><Icon name="back" /></button>
              ) : null}
              <div className="book-who">
                <img src={photoOf(booking)} alt="" />
                <div>
                  <h2 id="move-title">Move this session</h2>
                  <p><Icon name="pin" /> {booking.cities?.name || 'City'}</p>
                </div>
              </div>
              <button type="button" className="book-icon" aria-label="Close" onClick={() => { if (!busy) setMoveOpen(false) }}><Icon name="close" /></button>
            </header>
            <ol className="book-steps">
              <li className={moveStep === 'time' ? 'done' : 'now'}><span>{moveStep === 'time' ? '✓' : '1'}</span>Date</li>
              <li className={moveStep === 'time' ? 'now' : ''}><span>2</span>Time</li>
            </ol>
            <div className="book-body">
              <div className="book-mobile">
                {moveStep === 'date' ? (
                  <DateStep month={month} dates={dates} day={day} loading={datesLoading} pendingCalendar={pendingCalendar} error="" onMonth={shiftMoveMonth} onDay={pickDay} onRetry={() => setDatesReload((value) => value + 1)} />
                ) : (
                  <TimeStep day={day} times={times} chosen={nextTime} busy={slotsBusy} pendingCalendar={pendingCalendar} onPick={setNextTime} />
                )}
              </div>
              <div className="book-desk">
                <div className="book-pills book-pills-wide">
                  <button type="button" className="on" aria-pressed="true">
                    <i aria-hidden="true">✓</i>
                    <span>
                      <strong>{booking.services?.name || 'Service'}</strong>
                      <small>{[moveLength, movePrice].filter(Boolean).join(' · ') || 'This session'}</small>
                    </span>
                  </button>
                </div>
                <div className="book-split">
                  <DateStep month={month} dates={dates} day={day} loading={datesLoading} pendingCalendar={pendingCalendar} error="" onMonth={shiftMoveMonth} onDay={pickDay} onRetry={() => setDatesReload((value) => value + 1)} />
                  <TimeStep day={day} times={times} chosen={nextTime} busy={slotsBusy} pendingCalendar={pendingCalendar} onPick={setNextTime} />
                </div>
              </div>
            </div>
            <footer className="book-foot">
              <div className="book-summary">
                <strong>{nextTime ? `${booking.services?.name || 'Service'} · ${formatWhen(nextTime)}` : 'Choose an open time.'}</strong>
                <span>{moveLength ? `${moveLength} session` : 'The current time stays until the calendar accepts the change.'}</span>
              </div>
              {movePrice ? <strong className="book-price">{movePrice}</strong> : null}
              <div className="book-actions">
                <button type="button" className={`book-go book-go-step${busy ? ' is-busy' : ''}`} disabled={moveStep === 'date' ? !day || datesLoading || busy : !nextTime || busy} aria-busy={busy || undefined} onClick={moveStep === 'date' ? () => setMoveStep('time') : reschedule}>{busy ? <span className="spin" aria-hidden="true" /> : null}{moveStep === 'time' ? (movePrice ? `Move · ${movePrice}` : 'Move to this time') : 'Continue'}</button>
                <button type="button" className={`book-go book-go-desk${busy ? ' is-busy' : ''}`} disabled={!nextTime || busy} aria-busy={busy || undefined} onClick={reschedule}>{busy ? <span className="spin" aria-hidden="true" /> : null}{movePrice ? `Move · ${movePrice}` : 'Move'}</button>
              </div>
              <p className="book-pay">Payment is not taken here.</p>
            </footer>
          </div>
        </div>,
        document.body,
      ) : null}
      {ops ? (
        <section className="account-card">
          <h2>Payout</h2>
          <p className="muted">
            {!confirmedAt ? 'The client has not confirmed this visit.' : booking.saga_status !== 'paid' ? 'This reservation is not paid.' : pendingCents == null || pendingCents <= 0 ? 'There is no pending payout.' : 'The client confirmed the visit and a payout is pending.'}
          </p>
          <Button disabled={busy || !confirmedAt || booking.saga_status !== 'paid' || pendingCents == null || pendingCents <= 0} onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await authorizePayout(session, id)
              setNotice('Payout released.')
              await refresh()
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not release the payout.')
            } finally {
              setBusy(false)
            }
          }}>Release payout</Button>
        </section>
      ) : null}
      {canRead && door ? <Button kind="ghost" disabled={busy} onClick={readExternal}>Check the calendar</Button> : null}
      {external ? <Notice text={external} /> : null}
      {notice ? <Notice text={notice} /> : null}
      {error ? <ErrorBlock text={error} /> : null}
    </div>
  )
}

function Mark({ name }: { name: 'calendar' | 'clock' | 'length' | 'user' | 'pin' | 'card' | 'file' | 'info' | 'note' | 'close' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const shape = {
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3.5V7M16 3.5V7M4 10h16" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></>,
    length: <><path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8s8 4 8 8" /></>,
    user: <><circle cx="12" cy="9" r="3" /><path d="M6 19c1-3 3.2-4.5 6-4.5S17 16 18 19" /></>,
    pin: <><path d="M12 21s6-5 6-10a6 6 0 1 0-12 0c0 5 6 10 6 10Z" /><circle cx="12" cy="11" r="1.5" /></>,
    card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
    file: <><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5V8h4.5" /></>,
    info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></>,
    note: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5.5A2.5 2.5 0 0 0 8 10.5M16 6h2.5A2.5 2.5 0 0 1 16 10.5M9 20h6M12 14v6" /></>,
    close: <><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  }[name]
  return <span className="sd-mark">{<svg {...common} aria-hidden="true">{shape}</svg>}</span>
}
