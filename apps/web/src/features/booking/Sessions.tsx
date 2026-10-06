import { useEffect, useState } from 'react'
import { authorizePayout, calendarDoor, callFunction, loadAdminBookings, loadAttendance, loadBookingEvents, loadBookings, loadFinanceReport, type BookingEvent, type BookingRow, type Session } from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, Notice, SagaStatus } from '../../ui'
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

  const body = (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        <p>{hint}</p>
      </header>
      {loading ? <LoadingBlock kind="rows" /> : null}
      {error ? <ErrorBlock text={error} /> : null}
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
      {shown.length > 0 ? (
        <ul className="visit-list">
          {shown.map((row) => {
            const when = appointmentParts(row.starts_at)
            return (
              <li key={row.id}>
                <button type="button" className={`visit-card cal-${row.provider}`} onClick={() => onOpen(row.id)}>
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
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
  if (bare) return <section className="visit-embed">{body}</section>
  return <div className="page narrow">{body}</div>
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
  const [nextTime, setNextTime] = useState('')
  const [times, setTimes] = useState<string[]>([])
  const [month, setMonth] = useState(monthOf(new Date()))
  const [dates, setDates] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [datesLoading, setDatesLoading] = useState(false)
  const [pendingCalendar, setPendingCalendar] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
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
    if (!canChange || !booking || !door || booking.saga_status !== 'provider_confirmed') return
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
  }, [session, canChange, booking?.professional_id, booking?.saga_status, door, month])

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
    setBusy(true)
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
      setBusy(false)
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
      <article className="session-hero">
        <p className="kicker">{when.long}</p>
        <h1>{when.time || when.day}</h1>
        <SagaStatus status={booking.saga_status} />
        <dl className="session-facts">
          <div><dt>Therapist</dt><dd>{booking.professionals?.display_name || 'Therapist'}</dd></div>
          <div><dt>Service</dt><dd>{booking.services?.name || 'Service'}</dd></div>
          <div><dt>City</dt><dd>{booking.cities?.name || 'City'}</dd></div>
          {ops && booking.client?.full_name ? <div><dt>Client</dt><dd>{booking.client.full_name}</dd></div> : null}
          {ops ? <div><dt>Calendar</dt><dd>{booking.provider}</dd></div> : null}
          {ops && confirmedAt ? <div><dt>Visit confirmed</dt><dd>{formatWhen(confirmedAt)}</dd></div> : null}
          {ops && booking.external_charge_ref ? <div><dt>Charge reference</dt><dd>{booking.external_charge_ref}</dd></div> : null}
        </dl>
        <p className="muted">{booking.amount_cents == null ? 'Payment is not taken on this reservation.' : `An amount is recorded${booking.currency ? ` in ${booking.currency}` : ''}. This screen does not take payment.`}</p>
      </article>
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
        <section className="account-card">
          <h2>Move this session</h2>
          <p className="muted">Pick another open day and time. The current time stays until the calendar accepts the change.</p>
          <div className="month-row">
            <button type="button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setDay(''); setTimes([]); setNextTime('') }}>Prev</button>
            <strong>{formatMonth(month)}</strong>
            <button type="button" aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setDay(''); setTimes([]); setNextTime('') }}>Next</button>
          </div>
          {datesLoading ? <LoadingBlock kind="calendar" text="Checking open days…" /> : null}
          {pendingCalendar ? <p className="muted">The calendar did not return a time. Nothing was changed.</p> : null}
          {!datesLoading && dates.length === 0 && !pendingCalendar ? <p className="muted">No openings this month.</p> : null}
          {dates.length > 0 ? (
            <div className="choice-grid">
              {dates.map((date) => (
                <button type="button" key={date} className={date === day ? 'on' : ''} aria-pressed={date === day} onClick={() => pickDay(date)}>{formatDay(date)}</button>
              ))}
            </div>
          ) : null}
          {busy && day && times.length === 0 ? <LoadingBlock kind="times" text="Checking times…" /> : null}
          {day && times.length === 0 && !busy && !pendingCalendar ? <p className="muted">No open times that day.</p> : null}
          {times.length > 0 ? (
            <div className="choice-grid times">
              {times.map((time) => (
                <button type="button" key={time} className={time === nextTime ? 'on' : ''} aria-pressed={time === nextTime} onClick={() => setNextTime(time)}>{formatClock(time)}</button>
              ))}
            </div>
          ) : null}
          <div className="visit-actions">
            <Button busy={busy} disabled={!nextTime} onClick={reschedule}>Move to this time</Button>
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
        </section>
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
