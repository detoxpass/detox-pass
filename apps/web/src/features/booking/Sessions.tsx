import { useEffect, useState } from 'react'
import { callFunction, loadBookingEvents, loadBookings, type BookingEvent, type BookingRow, type Session } from '../../lib/supabase'
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

export function SessionList({ session, title, hint, bare = false, onOpen }: {
  session: Session
  title: string
  hint: string
  bare?: boolean
  onOpen: (id: string) => void
}) {
  const [rows, setRows] = useState<BookingRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    loadBookings(session)
      .then((next) => { if (alive) setRows(next) })
      .catch((caught: unknown) => { if (alive) setError(caught instanceof Error ? caught.message : 'Could not load sessions.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session])

  const body = (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        <p>{hint}</p>
      </header>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyBlock title="No sessions yet" text="A reservation appears here after the calendar confirms it." /> : null}
      {rows.length > 0 ? (
        <ul className="visit-list">
          {rows.map((row) => {
            const when = appointmentParts(row.starts_at)
            return (
              <li key={row.id}>
                <button type="button" className="visit-card" onClick={() => onOpen(row.id)}>
                  <span className="visit-when">
                    <strong>{when.day}</strong>
                    <em>{when.time}</em>
                  </span>
                  <span className="visit-who">
                    <strong>{row.professionals?.display_name || 'Therapist'}</strong>
                    <span>{row.services?.name || 'Service'} · {row.cities?.name || 'City'}</span>
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

export function SessionDetail({ session, id, canChange, canRead, onBack }: {
  session: Session
  id: string
  canChange: boolean
  canRead: boolean
  onBack: () => void
}) {
  const [rows, setRows] = useState<BookingRow[]>([])
  const [events, setEvents] = useState<BookingEvent[]>([])
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
    return Promise.all([loadBookings(session), loadBookingEvents(session, id)])
      .then(([bookings, timeline]) => {
        setRows(bookings)
        setEvents(timeline)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this session.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { void refresh() }, [session, id])

  const booking = rows.find((row) => row.id === id)
  const door = booking?.provider === 'internal' ? 'scheduling-internal' : 'scheduling-acuity'

  useEffect(() => {
    if (!canChange || !booking || booking.saga_status !== 'provider_confirmed') return
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

  if (loading) return <div className="page narrow"><LoadingBlock /></div>
  if (error && !booking) return <div className="page narrow"><ErrorBlock text={error} onRetry={() => { setError(''); void refresh() }} /></div>
  if (!booking) return <div className="page narrow"><EmptyBlock title="Session not found" text="This reservation is not on your account." /></div>

  const when = appointmentParts(booking.starts_at)
  const open = booking.saga_status === 'provider_confirmed'

  async function cancel() {
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
        </dl>
        <p className="muted">{booking.amount_cents == null ? 'Payment is not taken on this reservation.' : 'An amount is recorded. This screen does not take payment.'}</p>
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
      {canChange && open ? (
        <section className="account-card">
          <h2>Move this session</h2>
          <p className="muted">Pick another open day and time. The current time stays until the calendar accepts the change.</p>
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
          {day && times.length === 0 && !busy && !pendingCalendar ? <p className="muted">No open times that day.</p> : null}
          {times.length > 0 ? (
            <div className="choice-grid times">
              {times.map((time) => (
                <button type="button" key={time} className={time === nextTime ? 'on' : ''} aria-pressed={time === nextTime} onClick={() => setNextTime(time)}>{formatClock(time)}</button>
              ))}
            </div>
          ) : null}
          <div className="visit-actions">
            <Button disabled={busy || !nextTime} onClick={reschedule}>{busy ? 'Please wait' : 'Move to this time'}</Button>
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
      {canRead ? <Button kind="ghost" disabled={busy} onClick={readExternal}>Check the calendar</Button> : null}
      {external ? <Notice text={external} /> : null}
      {notice ? <Notice text={notice} /> : null}
      {error ? <ErrorBlock text={error} /> : null}
    </div>
  )
}
