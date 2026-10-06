import { useEffect, useState } from 'react'
import { formatWhen } from '../booking/when'
import { loadBookings, loadHours, loadMySchedule, type BookingRow, type MySchedule, type Session } from '../../lib/supabase'
import { ErrorBlock, LoadingBlock, SagaStatus } from '../../ui'

function endOfWeek(now: Date) {
  const end = new Date(now)
  const untilSunday = now.getDay() === 0 ? 0 : 7 - now.getDay()
  end.setDate(now.getDate() + untilSunday)
  end.setHours(23, 59, 59, 999)
  return end
}

function calendarLabel(mode: MySchedule['schedule_mode'], days: number) {
  if (mode === 'internal') return days === 0 ? 'Hours missing' : `${days} open day${days === 1 ? '' : 's'}`
  if (mode === 'external') return 'External calendar'
  return 'Not chosen'
}

export function PartnerHome({ session, go }: { session: Session; go: (path: string) => void }) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [profile, setProfile] = useState<MySchedule | null>(null)
  const [openDays, setOpenDays] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    loadMySchedule(session)
      .then(async (rows) => {
        const mine = rows[0] ?? null
        const visits = await loadBookings(session)
        const hours = mine ? await loadHours(session, mine.id) : []
        if (!alive) return
        setProfile(mine)
        setBookings(visits)
        setOpenDays(new Set(hours.map((hour) => hour.weekday)).size)
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load the dashboard.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session])

  if (loading) return <div className="page"><LoadingBlock kind="dash" text="Loading your dashboard…" /></div>
  if (error) return <ErrorBlock text={error} />

  const now = new Date()
  const weekEnd = endOfWeek(now)
  const upcoming = bookings
    .filter((row) => row.saga_status === 'provider_confirmed' && new Date(row.starts_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const thisWeek = upcoming.filter((row) => new Date(row.starts_at) <= weekEnd)
  const cancelled = bookings.filter((row) => row.saga_status === 'cancelled').length
  const name = profile?.display_name || 'there'
  const visible = profile?.active === true

  return (
    <div className="page dash">
      <section className="dash-hero">
        <div>
          <p className="kicker">Partner</p>
          <h1>Welcome back, {name}</h1>
          <p>{visible ? 'Clients can find this profile and book an open time.' : 'This profile stays hidden until the team approves it. You can still set the calendar.'}</p>
        </div>
        <button type="button" className="btn" onClick={() => go('/agenda')}>Open agenda</button>
      </section>

      <section className="dash-metrics" aria-label="Reservation totals">
        <article>
          <span>Upcoming</span>
          <strong>{upcoming.length}</strong>
          <small>Reserved times still ahead</small>
        </article>
        <article>
          <span>This week</span>
          <strong>{thisWeek.length}</strong>
          <small>Through Sunday</small>
        </article>
        <article>
          <span>Cancelled</span>
          <strong>{cancelled}</strong>
          <small>Reservations that were cancelled</small>
        </article>
        <article>
          <span>Calendar</span>
          <strong>{profile?.schedule_mode === 'internal' ? openDays : '—'}</strong>
          <small>{calendarLabel(profile?.schedule_mode ?? null, openDays)}</small>
        </article>
      </section>

      <section className="dash-next">
        <header>
          <div>
            <h2>Next reservations</h2>
            <p>These are real bookings. Payment is not taken on them.</p>
          </div>
          <button type="button" className="btn ghost" onClick={() => go('/agenda')}>View agenda</button>
        </header>
        {upcoming.length === 0 ? <p className="dash-empty">No upcoming reservations.</p> : null}
        <div className="dash-list">
          {upcoming.slice(0, 4).map((row) => (
            <button type="button" className="dash-item" key={row.id} onClick={() => go(`/agenda/${row.id}`)}>
              <span>
                <b>{row.services?.name ?? 'Service'}</b>
                <small>{row.cities?.name ?? 'City not set'}</small>
              </span>
              <SagaStatus status={row.saga_status} />
              <time dateTime={row.starts_at}>{formatWhen(row.starts_at)}</time>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
