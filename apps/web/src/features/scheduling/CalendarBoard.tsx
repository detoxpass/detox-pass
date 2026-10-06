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

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

function sameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b)
}

function clock(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function span(row: BookingRow) {
  const start = clock(row.starts_at)
  if (!row.ends_at) return start
  return `${start} – ${clock(row.ends_at)}`
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="m14 6-6 6 6 6" /> : <path d="m10 6 6 6-6 6" />}
    </svg>
  )
}

export function CalendarBoard({ bookings, onOpen }: {
  bookings: BookingRow[]
  onOpen: (id: string) => void
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const byDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>()
    for (const row of bookings) {
      if (row.saga_status === 'cancelled') continue
      const key = dayKey(new Date(row.starts_at))
      map.set(key, [...(map.get(key) ?? []), row])
    }
    for (const [key, items] of map) {
      map.set(key, items.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    }
    return map
  }, [bookings])

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
  const selectedKey = dayKey(cursor)
  const selected = byDay.get(selectedKey) ?? []
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  function shift(amount: number) {
    const next = new Date(cursor)
    if (view === 'month') next.setMonth(next.getMonth() + amount)
    else if (view === 'week') next.setDate(next.getDate() + amount * 7)
    else next.setDate(next.getDate() + amount)
    setCursor(next)
  }

  function openDay(day: Date) {
    setCursor(day)
    setView('day')
  }

  return (
    <section className="agenda-board">
      <div className="cal-switch" role="tablist" aria-label="Calendar view">
        {(['month', 'week', 'day'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>
            {item === 'month' ? 'Month' : item === 'week' ? 'Week' : 'Day'}
          </button>
        ))}
      </div>

      <div className="cal-nav">
        <button type="button" aria-label="Previous" onClick={() => shift(-1)}><Chevron dir="left" /></button>
        <div>
          <strong>
            {view === 'month' ? monthLabel : view === 'week' ? weekLabel : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </strong>
          {view === 'day' ? <small>{selected.length === 1 ? '1 reservation' : `${selected.length} reservations`}</small> : null}
        </div>
        <button type="button" aria-label="Next" onClick={() => shift(1)}><Chevron dir="right" /></button>
      </div>
      <button type="button" className="cal-today" onClick={() => setCursor(new Date())}>Today</button>

      {view === 'month' ? (
        <>
          <div className="month-grid">
            {DOW.map((label) => <span key={label} className="dow">{label}</span>)}
            {monthDays.map((day) => {
              const key = dayKey(day)
              const items = byDay.get(key) ?? []
              const providers = [...new Set(items.map((item) => item.provider))].slice(0, 4)
              const outside = day.getMonth() !== cursor.getMonth()
              const on = sameDay(day, cursor)
              return (
                <button
                  type="button"
                  key={key}
                  className={outside ? 'day outside' : on ? 'day on' : 'day'}
                  onClick={() => openDay(day)}
                  aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${items.length} reservations`}
                >
                  <span>{day.getDate()}</span>
                  <i aria-hidden="true">
                    {providers.map((provider) => <em key={provider} className={COLORS[provider] ?? 'cal-internal'} />)}
                  </i>
                </button>
              )
            })}
          </div>
          <Legend />
        </>
      ) : null}

      {view === 'week' ? (
        <>
          <div className="day-strip">
            {weekDays.map((day) => {
              const key = dayKey(day)
              const on = sameDay(day, cursor)
              const count = (byDay.get(key) ?? []).length
              return (
                <button type="button" key={key} className={on ? 'on' : ''} onClick={() => setCursor(day)}>
                  <small>{day.toLocaleDateString('en-US', { weekday: 'narrow' })}</small>
                  <span>{day.getDate()}</span>
                  {count > 0 ? <i /> : <i className="empty" />}
                </button>
              )
            })}
          </div>
          <div className="week-single">
            <DayTimeline items={selected} onOpen={onOpen} />
          </div>
          <div className="week-columns">
            <WeekColumns days={weekDays} byDay={byDay} onOpen={onOpen} />
          </div>
          <Legend />
        </>
      ) : null}

      {view === 'day' ? (
        <ul className="day-cards">
          {selected.length === 0 ? <li className="day-empty">No reservations on this day.</li> : selected.map((item) => (
            <li key={item.id}>
              <button type="button" className={`day-card ${COLORS[item.provider] ?? 'cal-internal'}`} onClick={() => onOpen(item.id)}>
                <strong>{span(item)}</strong>
                <span>{item.services?.name ?? 'Reservation'}</span>
                {item.cities?.name ? <em>{item.cities.name}</em> : null}
                <small>{LABELS[item.provider] ?? item.provider}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function Legend() {
  return (
    <ul className="cal-legend">
      {Object.entries(LABELS).map(([key, label]) => (
        <li key={key}><i className={COLORS[key]} />{label}</li>
      ))}
    </ul>
  )
}

function hoursOf(items: BookingRow[]) {
  let start = 9
  let end = 18
  for (const item of items) {
    const from = new Date(item.starts_at)
    const to = item.ends_at ? new Date(item.ends_at) : new Date(from.getTime() + 60 * 60 * 1000)
    start = Math.min(start, from.getHours())
    end = Math.max(end, to.getHours() + (to.getMinutes() > 0 ? 1 : 0))
  }
  return { start: Math.max(0, start), end: Math.min(24, Math.max(end, start + 4)) }
}

function blockStyle(item: BookingRow, startHour: number) {
  const from = new Date(item.starts_at)
  const to = item.ends_at ? new Date(item.ends_at) : new Date(from.getTime() + 60 * 60 * 1000)
  const top = ((from.getHours() + from.getMinutes() / 60) - startHour) * 56
  const height = Math.max(28, ((to.getTime() - from.getTime()) / 3600000) * 56 - 4)
  return { top, height }
}

function DayTimeline({ items, onOpen }: { items: BookingRow[]; onOpen: (id: string) => void }) {
  const { start, end } = hoursOf(items)
  const rows = Array.from({ length: end - start }, (_, index) => start + index)
  return (
    <div className="time-board" style={{ height: rows.length * 56 }}>
      {rows.map((hour, index) => (
        <div key={hour} className="time-hour" style={{ top: index * 56 }}>
          <span>{new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>
        </div>
      ))}
      {items.length === 0 ? <p className="time-empty">No reservations on this day.</p> : items.map((item) => {
        const box = blockStyle(item, start)
        return (
          <button type="button" key={item.id} className={COLORS[item.provider] ?? 'cal-internal'} style={{ top: box.top, height: box.height }} onClick={() => onOpen(item.id)}>
            <strong>{span(item)}</strong>
            <span>{item.services?.name ?? LABELS[item.provider] ?? 'Reservation'}</span>
          </button>
        )
      })}
    </div>
  )
}

function WeekColumns({ days, byDay, onOpen }: {
  days: Date[]
  byDay: Map<string, BookingRow[]>
  onOpen: (id: string) => void
}) {
  const all = days.flatMap((day) => byDay.get(dayKey(day)) ?? [])
  const { start, end } = hoursOf(all)
  const rows = Array.from({ length: end - start }, (_, index) => start + index)
  return (
    <div className="week-scale" style={{ height: rows.length * 56 + 36 }}>
      <div className="week-head">
        <span />
        {days.map((day) => <strong key={dayKey(day)}>{day.toLocaleDateString('en-US', { weekday: 'narrow' })} {day.getDate()}</strong>)}
      </div>
      <div className="week-body" style={{ height: rows.length * 56 }}>
        <div>
          {rows.map((hour, index) => <span key={hour} style={{ top: index * 56 }}>{new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>)}
        </div>
        {days.map((day) => {
          const items = byDay.get(dayKey(day)) ?? []
          return (
            <div key={dayKey(day)}>
              {items.map((item) => {
                const box = blockStyle(item, start)
                return (
                  <button type="button" key={item.id} className={COLORS[item.provider] ?? 'cal-internal'} style={{ top: box.top, height: box.height }} onClick={() => onOpen(item.id)}>
                    <strong>{clock(item.starts_at)}</strong>
                    <span>{item.services?.name ?? LABELS[item.provider] ?? 'Reservation'}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
