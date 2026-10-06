import { useMemo, useState } from 'react'
import type { BookingRow } from '../../lib/supabase'

const COLORS: Record<string, string> = {
  internal: 'cal-internal',
  square: 'cal-square',
  acuity: 'cal-acuity',
  wix: 'cal-wix',
  zenoti: 'cal-zenoti',
  mindbody: 'cal-mindbody',
}

const LABELS: Record<string, string> = {
  internal: 'Detox Pass',
  square: 'Square',
  acuity: 'Acuity',
  wix: 'Wix',
  zenoti: 'Zenoti',
  mindbody: 'Mindbody',
}

function dayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function startOfWeek(value: Date) {
  const next = new Date(value)
  const day = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - day)
  next.setHours(0, 0, 0, 0)
  return next
}

export function CalendarBoard({ bookings, onOpen }: {
  bookings: BookingRow[]
  onOpen: (id: string) => void
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const live = bookings.filter((row) => row.saga_status !== 'cancelled')

  const byDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>()
    for (const row of live) {
      const key = dayKey(new Date(row.starts_at))
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return map
  }, [live])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(monthStart)
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + index)
    return day
  })
  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + index)
    return day
  })

  function shift(amount: number) {
    const next = new Date(cursor)
    if (view === 'month') next.setMonth(next.getMonth() + amount)
    else next.setDate(next.getDate() + amount * 7)
    setCursor(next)
  }

  return (
    <section className="agenda-board">
      <header>
        <strong>{view === 'month' ? monthLabel : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</strong>
        <div>
          <button type="button" onClick={() => setView('month')} aria-pressed={view === 'month'}>Month</button>
          <button type="button" onClick={() => setView('week')} aria-pressed={view === 'week'}>Week</button>
          <button type="button" onClick={() => shift(-1)} aria-label="Previous">Prev</button>
          <button type="button" onClick={() => setCursor(new Date())}>Today</button>
          <button type="button" onClick={() => shift(1)} aria-label="Next">Next</button>
        </div>
      </header>
      <ul className="cal-legend">
        {Object.entries(LABELS).map(([key, label]) => <li key={key} className={COLORS[key]}>{label}</li>)}
      </ul>
      {view === 'month' ? (
        <div className="month-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => <span key={label} className="dow">{label}</span>)}
          {monthDays.map((day) => {
            const key = dayKey(day)
            const items = byDay.get(key) ?? []
            const outside = day.getMonth() !== cursor.getMonth()
            return (
              <div key={key} className={outside ? 'day outside' : 'day'}>
                <span>{day.getDate()}</span>
                <div>
                  {items.slice(0, 3).map((item) => (
                    <button type="button" key={item.id} className={COLORS[item.provider] ?? 'cal-internal'} onClick={() => onOpen(item.id)}>
                      {new Date(item.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </button>
                  ))}
                  {items.length > 3 ? <small>+{items.length - 3}</small> : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="week-grid">
          {weekDays.map((day) => {
            const key = dayKey(day)
            const items = (byDay.get(key) ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            return (
              <div key={key} className="day">
                <span>{day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                {items.length === 0 ? <small>No reservations</small> : items.map((item) => (
                  <button type="button" key={item.id} className={COLORS[item.provider] ?? 'cal-internal'} onClick={() => onOpen(item.id)}>
                    {new Date(item.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    <em>{item.services?.name ?? LABELS[item.provider] ?? item.provider}</em>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
