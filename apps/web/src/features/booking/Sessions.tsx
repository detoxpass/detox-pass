import { useEffect, useState } from 'react'
import { callFunction, loadBookingEvents, loadBookings, type BookingEvent, type BookingRow, type Session } from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, Notice, PendingBlock, SagaStatus } from '../../ui'

function when(value: string | null) {
  return value || '—'
}

export function SessionList({ session, readOnly, onOpen }: {
  session: Session
  readOnly: boolean
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

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} />
  if (rows.length === 0) {
    return <EmptyBlock title={readOnly ? 'No sessions yet' : 'No sessions yet'} text={readOnly ? 'Reservations for this account will show up here.' : 'A reservation appears here after the calendar confirms it.'} />
  }
  return (
    <div className="catalog-grid">
      {rows.map((row) => (
        <button type="button" className="session-card" key={row.id} onClick={() => onOpen(row.id)}>
          <strong>{row.professionals?.display_name || 'Therapist'}</strong>
          <span>{row.services?.name || 'Service'}</span>
          <span>{row.cities?.name || 'City'}</span>
          <span>{row.starts_at}</span>
          <SagaStatus status={row.saga_status} />
        </button>
      ))}
    </div>
  )
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
  const [day, setDay] = useState('')
  const [pendingCalendar, setPendingCalendar] = useState(false)
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
  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock text={error} onRetry={() => { setError(''); void refresh() }} />
  if (!booking) return <EmptyBlock title="Session not found" text="This reservation is not on your account." />

  async function cancel() {
    setBusy(true)
    setError('')
    try {
      const result = await callFunction(session, 'scheduling-acuity', { action: 'cancel', booking_id: id })
      const body = result.body as { status?: string } | null
      if (body?.status !== 'cancelled') {
        setError('The calendar and the platform did not both cancel.')
        return
      }
      setNotice('Cancelled.')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel.')
    } finally {
      setBusy(false)
    }
  }

  async function loadTimes() {
    if (!day) return
    setBusy(true)
    setPendingCalendar(false)
    try {
      const result = await callFunction(session, 'scheduling-acuity', {
        action: 'availability',
        professional_id: booking?.professional_id,
        date: day,
      })
      if (result.status === 422) {
        setPendingCalendar(true)
        return
      }
      const body = result.body as { times?: { time?: string }[] } | null
      setTimes((body?.times ?? []).flatMap((item) => item.time ? [item.time] : []))
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
      const result = await callFunction(session, 'scheduling-acuity', { action: 'reschedule', booking_id: id, starts_at: nextTime })
      const body = result.body as { status?: string } | null
      if (body?.status !== 'provider_confirmed') {
        setError('The calendar and the platform did not both change the time.')
        return
      }
      setNotice('Rescheduled. Payment is not part of this step.')
      setNextTime('')
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
      const result = await callFunction(session, 'scheduling-acuity', { action: 'read', booking_id: id })
      const body = result.body as { supported?: boolean; diverged?: boolean; external_starts_at?: string | null; external_canceled?: boolean } | null
      if (body?.supported === false || result.status === 422) {
        setPendingCalendar(true)
        return
      }
      setExternal(body?.diverged ? `The calendar differs. External time: ${body.external_starts_at || 'unknown'}. Canceled there: ${body.external_canceled ? 'yes' : 'no'}.` : 'The calendar matches this reservation.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the calendar.')
    } finally {
      setBusy(false)
    }
  }

  const open = booking.saga_status === 'provider_confirmed'

  return (
    <div className="stack">
      <button type="button" className="back" onClick={onBack}>Back</button>
      <section className="account-card">
        <h2>{booking.professionals?.display_name}</h2>
        <p>{booking.services?.name} · {booking.cities?.name}</p>
        <p>{booking.starts_at}</p>
        <SagaStatus status={booking.saga_status} />
        <p className="muted">{booking.amount_cents == null ? 'Not paid. Charging is not connected.' : 'This reservation has an amount on record.'}</p>
      </section>
      <section className="account-card">
        <h2>History</h2>
        {events.length === 0 ? <EmptyBlock title="No events" text="Changes will be listed here." /> : (
          <ul className="stack">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.event_type}</strong>
                <span> {when(event.from_starts_at)} → {when(event.to_starts_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canChange && open ? (
        <section className="account-card">
          <h2>Change</h2>
          <label className="field"><span>Another date from the calendar</span>
            <input value={day} onChange={(event) => setDay(event.target.value)} placeholder="YYYY-MM-DD" />
          </label>
          <Button kind="ghost" disabled={busy || !day} onClick={loadTimes}>Show times</Button>
          {pendingCalendar ? <PendingBlock text="The calendar did not return a time. Nothing was changed." /> : null}
          {times.length > 0 ? (
            <div className="slot-list">
              {times.map((time) => (
                <button type="button" key={time} className={time === nextTime ? 'on' : ''} onClick={() => setNextTime(time)}>{time}</button>
              ))}
            </div>
          ) : null}
          <Button disabled={busy || !nextTime} onClick={reschedule}>Reschedule</Button>
          <Button kind="ghost" disabled={busy} onClick={cancel}>Cancel reservation</Button>
        </section>
      ) : null}
      {canRead ? <Button kind="ghost" disabled={busy} onClick={readExternal}>Read from calendar</Button> : null}
      {external ? <Notice text={external} /> : null}
      {notice ? <Notice text={notice} /> : null}
      {error ? <ErrorBlock text={error} /> : null}
    </div>
  )
}

