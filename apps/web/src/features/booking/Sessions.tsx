import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { authorizePayout, calendarDoor, callFunction, loadAdminBookings, loadAttendance, loadBookingEvents, loadBookings, loadFinanceReport, type BookingEvent, type BookingRow, type Session } from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, Icon, LoadingBlock, Notice, SagaStatus } from '../../ui'
import { appointmentParts, formatClock, formatDay, formatMonth, formatWhen, monthOf, shiftMonth } from './when'

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

function amountOf(row: BookingRow) {
  if (row.amount_cents == null) return 'Payment is not taken here.'
  if (row.currency) return money(row.amount_cents, row.currency)
  return 'An amount is recorded. This screen does not take payment.'
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
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const historyPage = history.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const cancelledCount = shown.filter((row) => row.saga_status === 'cancelled').length

  const body = (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        <p>{hint}</p>
      </header>
      {loading ? <LoadingBlock text="Loading sessions…" /> : null}
      {error ? <ErrorBlock text={error} /> : null}
      {!ops && bare && shown.length > 0 ? (
        <ul className="visit-list">
          {shown.map((row) => <li key={row.id}><VisitButton row={row} ops={false} onOpen={onOpen} /></li>)}
        </ul>
      ) : null}
      {!ops && !bare && !loading && !error && shown.length > 0 ? (
        <>
          <div className="session-kpis" aria-label="Session totals">
            <article><span>Upcoming</span><strong>{upcoming.length}</strong></article>
            <article><span>Past</span><strong>{history.length - cancelledCount}</strong></article>
            <article><span>Cancelled</span><strong>{cancelledCount}</strong></article>
          </div>
          {next ? (
            <button type="button" className="session-next" onClick={() => onOpen(next.id)}>
              <img src={photoOf(next)} alt="" />
              <span>
                <em>Next session</em>
                <strong>{next.professionals?.display_name || 'Therapist'}</strong>
                <span>{next.services?.name || 'Service'} · {next.cities?.name || 'City'}</span>
                <span>{appointmentParts(next.starts_at).long} · {appointmentParts(next.starts_at).time}</span>
                <SagaStatus status={next.saga_status} />
              </span>
            </button>
          ) : <EmptyBlock title="No upcoming session" text="A future reservation appears here after the calendar confirms it." />}
          {later.length > 0 ? (
            <section className="session-block">
              <h2>Coming up</h2>
              <ul className="visit-list">
                {later.map((row) => <li key={row.id}><VisitButton row={row} ops={false} onOpen={onOpen} /></li>)}
              </ul>
            </section>
          ) : null}
          <section className="session-block">
            <h2>History</h2>
            {history.length === 0 ? <p className="muted">Past and cancelled reservations show up here.</p> : (
              <>
                <ul className="visit-list">
                  {historyPage.map((row) => <li key={row.id}><VisitButton row={row} ops={false} onOpen={onOpen} /></li>)}
                </ul>
                {pageCount > 1 ? (
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
  return <div className="page narrow">{body}</div>
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
  const [external, setExternal] = useState('')

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
  }, [moveOpen, session, canChange, booking?.professional_id, booking?.saga_status, door, month])

  if (loading) return <div className="page narrow"><LoadingBlock kind="detail" text="Loading this session…" /></div>
  if (error && !booking) return <div className="page narrow"><ErrorBlock text={error} onRetry={() => { setError(''); void refresh() }} /></div>
  if (!booking) return <div className="page narrow"><EmptyBlock title="Session not found" text="This reservation is not on your account." /></div>

  const when = appointmentParts(booking.starts_at)
  const open = booking.saga_status === 'provider_confirmed'

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
    <div className="page narrow visit-page">
      <button type="button" className="back" onClick={onBack}>Back</button>
      <article className="session-hero session-person">
        <img src={photoOf(booking)} alt="" />
        <div>
          <p className="kicker">{booking.cities?.name || 'City not set'}</p>
          <h1>{booking.professionals?.display_name || 'Therapist'}</h1>
          <p>{booking.services?.name || 'Service'}</p>
          <SagaStatus status={booking.saga_status} />
        </div>
      </article>
      <dl className="session-facts">
        <div><dt>Date</dt><dd>{when.long}</dd></div>
        <div><dt>Time</dt><dd>{when.time || 'Time not set'}</dd></div>
        {lengthOf(booking.starts_at, booking.ends_at) ? <div><dt>Length</dt><dd>{lengthOf(booking.starts_at, booking.ends_at)}</dd></div> : null}
        <div><dt>Service</dt><dd>{booking.services?.name || 'Service'}</dd></div>
        <div><dt>City</dt><dd>{booking.cities?.name || 'City'}</dd></div>
        <div><dt>Amount</dt><dd>{amountOf(booking)}</dd></div>
        {ops && booking.client?.full_name ? <div><dt>Client</dt><dd>{booking.client.full_name}</dd></div> : null}
        {ops ? <div><dt>Calendar</dt><dd>{booking.provider}</dd></div> : null}
        {ops && confirmedAt ? <div><dt>Visit confirmed</dt><dd>{formatWhen(confirmedAt)}</dd></div> : null}
        {ops && booking.external_charge_ref ? <div><dt>Charge reference</dt><dd>{booking.external_charge_ref}</dd></div> : null}
      </dl>
      <section className="account-card">
        <h2>Details</h2>
        <ul className="session-notes">
          <li>Payment is not taken on this reservation.</li>
          <li>The current time stays until the calendar accepts a change.</li>
          <li>Cancelling does not refund anything, because payment is not connected.</li>
        </ul>
      </section>
      <section className="account-card">
        <h2>What happened</h2>
        {events.length === 0 ? <p className="muted">Changes will be listed here.</p> : (
          <ol className="timeline">
            {events.map((event) => {
              const moved = event.from_starts_at && event.to_starts_at && event.from_starts_at !== event.to_starts_at
              return (
                <li key={event.id}>
                  <i />
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
      {canChange && open && !door ? <p className="muted">This calendar is not connected yet. Nothing was changed.</p> : null}
      {canChange && open && door ? (
        <div className="visit-actions">
          <Button disabled={busy} onClick={() => setMoveOpen(true)}>Move this session</Button>
          {confirmCancel ? (
            <div className="confirm-box">
              <p>Cancel this reservation? Payment is not connected, so this does not refund anything.</p>
              <div className="visit-actions">
                <Button kind="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep it</Button>
                <Button disabled={busy} onClick={cancel}>Cancel reservation</Button>
              </div>
            </div>
          ) : <Button kind="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel reservation</Button>}
        </div>
      ) : null}
      {moveOpen ? createPortal(
        <div className="book-back" role="presentation" onClick={() => { if (!busy) setMoveOpen(false) }}>
          <div className="book-sheet move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-title" onClick={(event) => event.stopPropagation()}>
            <header className="book-head">
              <div className="book-who">
                <img src={photoOf(booking)} alt="" />
                <div>
                  <h2 id="move-title">Move this session</h2>
                  <p>The current time stays until the calendar accepts the change.</p>
                </div>
              </div>
              <button type="button" className="book-icon" aria-label="Close" onClick={() => { if (!busy) setMoveOpen(false) }}><Icon name="close" /></button>
            </header>
            <div className="book-body">
              <div className="month-row">
                <button type="button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setDay(''); setTimes([]); setNextTime('') }}>Prev</button>
                <strong>{formatMonth(month)}</strong>
                <button type="button" aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setDay(''); setTimes([]); setNextTime('') }}>Next</button>
              </div>
              {datesLoading ? <LoadingBlock text="Checking open days…" /> : null}
              {pendingCalendar ? <p className="muted">The calendar did not return a time. Nothing was changed.</p> : null}
              {!datesLoading && dates.length === 0 && !pendingCalendar ? <p className="muted">No openings this month.</p> : null}
              {dates.length > 0 ? (
                <div className="choice-grid">
                  {dates.map((date) => (
                    <button type="button" key={date} className={date === day ? 'on' : ''} aria-pressed={date === day} onClick={() => pickDay(date)}>{formatDay(date)}</button>
                  ))}
                </div>
              ) : null}
              {slotsBusy ? <LoadingBlock text="Checking times…" /> : null}
              {day && times.length === 0 && !slotsBusy && !pendingCalendar ? <p className="muted">No open times that day.</p> : null}
              {times.length > 0 ? (
                <div className="choice-grid times">
                  {times.map((time) => (
                    <button type="button" key={time} className={time === nextTime ? 'on' : ''} aria-pressed={time === nextTime} onClick={() => setNextTime(time)}>{formatClock(time)}</button>
                  ))}
                </div>
              ) : null}
            </div>
            <footer className="book-foot">
              <button type="button" className={`book-go${busy ? ' is-busy' : ''}`} disabled={!nextTime || busy} aria-busy={busy || undefined} onClick={reschedule}>{busy ? <span className="spin" aria-hidden="true" /> : null}Move to this time</button>
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
