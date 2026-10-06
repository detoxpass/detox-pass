import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  addBlock,
  callFunction,
  completeEntryCalendar,
  loadBlocks,
  loadEntryState,
  loadBookings,
  loadHours,
  loadMySchedule,
  removeBlock,
  reorderCalendars,
  replaceHours,
  setScheduleChoice,
  setScheduleGrid,
  type BookingRow,
  type MySchedule,
  type Session,
} from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, Icon, LoadingBlock, Notice } from '../../ui'

const DAYS: [number, string][] = [
  [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday'],
]
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo']
const LENGTHS = [30, 45, 60, 90, 120]
const CALENDARS = [
  { id: 'internal', label: 'Detox Pass', logo: '/brand/logo-black.png', note: 'Hours you keep here' },
  { id: 'square', label: 'Square', logo: '/brand/calendars/square.svg', note: 'Sign in with Square' },
  { id: 'acuity', label: 'Acuity', logo: '/brand/calendars/acuity.svg', note: 'Not on this screen yet' },
  { id: 'wix', label: 'Wix', logo: '/brand/calendars/wix.svg', note: 'Not on this screen yet' },
  { id: 'zenoti', label: 'Zenoti', logo: '/brand/calendars/zenoti.svg', note: 'Not on this screen yet' },
  { id: 'mindbody', label: 'Mindbody', logo: '/brand/calendars/mindbody.svg', note: 'Not on this screen yet' },
]

type SquareOption = { id?: string; variationId?: string; name: string }

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}
function monthStamp(value: Date) {
  return value.getFullYear() * 12 + value.getMonth()
}

function hoursThisMonth(rows: Draft[], now = new Date()) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  let minutes = 0
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    for (const row of rows) {
      if (row.weekday !== weekday) continue
      const start = timeToMinutes(row.start)
      const end = timeToMinutes(row.end)
      if (start == null || end == null || end <= start) continue
      minutes += end - start
    }
  }
  return Math.round(minutes / 60)
}

function visitsInMonth(rows: BookingRow[], stamp: number, provider?: string) {
  return rows.filter((row) => {
    if (row.saga_status === 'cancelled') return false
    if (provider && row.provider !== provider) return false
    return monthStamp(new Date(row.starts_at)) === stamp
  }).length
}

function nextVisit(rows: BookingRow[]) {
  const now = Date.now()
  return rows
    .filter((row) => row.saga_status !== 'cancelled' && new Date(row.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
}

function visitWhen(row: BookingRow) {
  const when = new Date(row.starts_at)
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const same = when.toDateString() === new Date().toDateString()
  const day = same ? 'Today' : when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day}, ${time}`
}

function zonedInstant(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString()
}

type Draft = { weekday: number; start: string; end: string }

export function Integrations({ session, embedded, onReady }: {
  session: Session
  embedded?: boolean
  onReady?: () => void
}) {
  const [schedule, setSchedule] = useState<MySchedule | null>(null)
  const [visits, setVisits] = useState<BookingRow[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [openId, setOpenId] = useState('')
  const [menuId, setMenuId] = useState('')
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [windows, setWindows] = useState<Draft[]>([])
  const [blocks, setBlocks] = useState<{ id: string; starts_at: string; ends_at: string }[]>([])
  const [timezone, setTimezone] = useState('America/New_York')
  const [slot, setSlot] = useState(60)
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('12:00')
  const [blockEnd, setBlockEnd] = useState('13:00')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [squareVia, setSquareVia] = useState<string | null>(null)
  const [locations, setLocations] = useState<SquareOption[]>([])
  const [members, setMembers] = useState<SquareOption[]>([])
  const [services, setServices] = useState<SquareOption[]>([])
  const [locationId, setLocationId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [variationId, setVariationId] = useState('')
  const drag = useRef('')
  const wantChoice = useRef(new URLSearchParams(window.location.search).get('square') === 'choose')

  function reload() {
    setLoading(true)
    Promise.all([loadMySchedule(session), loadEntryState(session)])
      .then(async ([rows, entry]) => {
        const row = rows[0] ?? null
        setSchedule(row)
        setOrder((entry.calendars ?? []).map((item) => item.key))
        if (!row) return
        setTimezone(row.schedule_timezone)
        setSlot(row.slot_minutes)
        const [hours, closed, bookings] = await Promise.all([
          loadHours(session, row.id),
          loadBlocks(session, row.id),
          loadBookings(session).catch(() => [] as BookingRow[]),
        ])
        setVisits(bookings)
        setWindows(hours.map((hour) => ({
          weekday: hour.weekday,
          start: minutesToTime(hour.start_minute),
          end: minutesToTime(hour.end_minute),
        })))
        setBlocks(closed)
        try {
          const status = await callFunction(session, 'scheduling-square', { action: 'status', professional_id: row.id })
          const account = status.body && typeof status.body === 'object' ? status.body as Record<string, unknown> : {}
          setSquareVia(typeof account.via === 'string' ? account.via : null)
          if (wantChoice.current || account.pendingChoice === true) {
            wantChoice.current = false
            setOpenId('square')
            const options = await callFunction(session, 'scheduling-square', { action: 'options', professional_id: row.id })
            const listed = options.body && typeof options.body === 'object' ? options.body as Record<string, unknown> : {}
            if (listed.status === 'choose') applyChoices(listed)
          }
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Could not read the Square connection.')
        }
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load calendars.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('square')
    if (!result) return
    const messages: Record<string, string> = {
      connected: 'Square is connected. It stays pending until a live booking is completed.',
      choose: 'Square has more than one option. Pick the location, person, and service, then save.',
      incomplete: 'Square still needs a location, a team member, and a bookable service.',
      denied: 'Square sign-in was cancelled.',
      error: 'Square sign-in did not finish. Try again.',
    }
    if (messages[result]) setNotice(messages[result])
    if (result === 'connected' || result === 'choose' || result === 'incomplete') setOpenId('square')
    params.delete('square')
    const next = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${next ? `?${next}` : ''}`)
  }, [])

  function applyChoices(body: Record<string, unknown>) {
    const nextLocations = Array.isArray(body.locations) ? body.locations as SquareOption[] : []
    const nextMembers = Array.isArray(body.members) ? body.members as SquareOption[] : []
    const nextServices = Array.isArray(body.services) ? body.services as SquareOption[] : []
    setLocations(nextLocations)
    setMembers(nextMembers)
    setServices(nextServices)
    setLocationId(nextLocations[0]?.id ?? '')
    setMemberId(nextMembers[0]?.id ?? '')
    setVariationId(nextServices[0]?.variationId ?? '')
  }

  async function connectSquare(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    setBusy(true)
    setError('')
    try {
      const choosing = locations.length > 1 || members.length > 1 || services.length > 1
      const result = choosing
        ? await callFunction(session, 'scheduling-square', {
          action: 'finish',
          professional_id: schedule.id,
          location_id: locationId || undefined,
          team_member_id: memberId || undefined,
          service_variation_id: variationId || undefined,
        })
        : await callFunction(session, 'scheduling-square', {
          action: 'oauth_start',
          professional_id: schedule.id,
          environment: 'production',
        })
      const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : {}
      if (!choosing && typeof body.url === 'string') {
        window.location.assign(body.url)
        return
      }
      if (body.status === 'choose') {
        applyChoices(body)
        setNotice('Square has more than one option. Pick the location, person, and service, then save.')
        return
      }
      if (!body.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Square did not connect.')
      setLocations([])
      setMembers([])
      setServices([])
      setNotice(body.status === 'tested' ? 'Square is connected.' : 'Square is connected. It stays pending until a live booking is completed.')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect Square.')
    } finally {
      setBusy(false)
    }
  }

  async function saveGrid(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    const next = windows.flatMap((window) => {
      const start = timeToMinutes(window.start)
      const end = timeToMinutes(window.end)
      if (start == null || end == null || end <= start) return []
      return [{ weekday: window.weekday, start_minute: start, end_minute: end }]
    })
    setBusy(true)
    setError('')
    try {
      await setScheduleChoice(session, 'internal', true)
      await setScheduleGrid(session, timezone, slot)
      await replaceHours(session, schedule.id, next)
      setNotice('Weekly hours saved.')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the hours.')
    } finally {
      setBusy(false)
    }
  }

  async function createBlock(event: FormEvent) {
    event.preventDefault()
    if (!schedule || !blockDate) return
    setBusy(true)
    setError('')
    try {
      await addBlock(session, schedule.id, zonedInstant(blockDate, blockStart, timezone), zonedInstant(blockDate, blockEnd, timezone))
      setNotice('Block saved.')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the block.')
    } finally {
      setBusy(false)
    }
  }

  async function move(key: string, direction: -1 | 1) {
    const index = order.indexOf(key)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return
    const next = [...order]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    setOrder(next)
    try {
      await reorderCalendars(session, next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the priority.')
      reload()
    }
  }

  async function finishCalendar() {
    setBusy(true)
    setError('')
    try {
      await completeEntryCalendar(session)
      onReady?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Publish hours or finish a calendar first.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingBlock text="Loading calendars…" />
  if (!schedule) return <EmptyBlock title="No professional profile" text="This account is not a professional yet." />

  const squareOn = (schedule.schedule_connections ?? []).some((row) => row.provider === 'square' && (row.status === 'tested' || row.status === 'homologated'))
  const choosing = locations.length > 1 || members.length > 1 || services.length > 1
  const open = CALENDARS.find((calendar) => calendar.id === openId)
  const now = new Date()
  const thisMonth = monthStamp(now)
  const reservationCount = visitsInMonth(visits, thisMonth)
  const previousCount = visitsInMonth(visits, thisMonth - 1)
  const change = previousCount > 0 ? Math.round(((reservationCount - previousCount) / previousCount) * 100) : null
  const upcoming = nextVisit(visits)
  const published = windows.length > 0
  const partners = CALENDARS.filter((calendar) => calendar.id !== 'internal')

  return (
    <div className={embedded ? 'stack entry-calendars' : 'stack'}>
      <section className="integ-hero">
        <div className="integ-hero-top">
          <span className="integ-icon" aria-hidden="true"><Icon name="calendar" /></span>
          <div className="integ-hero-copy">
            <div className="integ-brand">
              <img src="/brand/logo-black.png" alt="Detox Pass" />
              <span className="integ-pill">Primary calendar</span>
            </div>
            <p>{published ? 'Your main calendar. Set your availability and services.' : 'Your main calendar. Publish your hours so clients can book.'}</p>
          </div>
          <div className="integ-hero-side">
            <span className={published ? 'integ-live' : 'integ-live integ-quiet'}>
              <i />{published ? 'Active' : 'Set up'}
            </span>
            <button type="button" className="integ-outline integ-manage desk" onClick={() => setOpenId('internal')}>Manage calendar →</button>
          </div>
        </div>
        <div className="integ-stats">
          <div className="integ-stat">
            <span>Hours published</span>
            <strong>{hoursThisMonth(windows)}</strong>
            <small>this month</small>
          </div>
          <div className="integ-stat">
            <span>Total reservations</span>
            <strong>
              {reservationCount}
              {change != null ? <em className={change >= 0 ? 'integ-up' : 'integ-down'}>{change >= 0 ? '↑' : '↓'}{Math.abs(change)}%</em> : null}
            </strong>
            <small>this month</small>
          </div>
          <div className="integ-stat">
            <span>Next reservation</span>
            <strong className="integ-when">{upcoming ? visitWhen(upcoming) : 'None'}</strong>
            <small>{upcoming ? [upcoming.services?.name, upcoming.cities?.name].filter(Boolean).join(' · ') || 'Reservation' : 'Nothing scheduled'}</small>
          </div>
        </div>
        <button type="button" className="integ-outline integ-manage mob" onClick={() => setOpenId('internal')}>Manage calendar →</button>
      </section>

      <section className="integ-partners">
        <header className="integ-head">
          <div>
            <h2>Connected calendars</h2>
            <p>A connected calendar can receive the reservation. The first in the priority list wins.</p>
          </div>
          <button type="button" className="integ-outline" onClick={() => setPriorityOpen(true)} disabled={order.length === 0}>Set priority</button>
        </header>
        <div className="integ-grid">
          {partners.map((calendar) => {
            const connected = calendar.id === 'square' && squareOn
            const count = visitsInMonth(visits, thisMonth, calendar.id)
            return (
              <article className="integ-card" key={calendar.id}>
                <img src={calendar.logo} alt="" />
                <div className="integ-name">
                  <strong>{calendar.label}</strong>
                  <em className={connected ? 'integ-ok' : 'integ-off'}>{connected ? 'Connected' : 'Not connected'}</em>
                </div>
                <p>{connected
                  ? `${count} ${count === 1 ? 'reservation' : 'reservations'} this month`
                  : calendar.id === 'square'
                    ? 'Sign in with Square to receive reservations.'
                    : `This screen does not connect ${calendar.label} yet.`}</p>
                <button type="button" className="integ-more" aria-label={`${calendar.label} actions`} aria-expanded={menuId === calendar.id} onClick={() => setMenuId(menuId === calendar.id ? '' : calendar.id)}>
                  <Icon name="more" />
                </button>
                {menuId === calendar.id ? (
                  <div className="integ-menu">
                    <button type="button" onClick={() => { setMenuId(''); setOpenId(calendar.id) }}>{connected ? 'Manage' : 'Connect'}</button>
                    <button type="button" disabled={order.length === 0} onClick={() => { setMenuId(''); setPriorityOpen(true) }}>Set priority</button>
                  </div>
                ) : null}
                <button type="button" className="integ-outline integ-action" onClick={() => setOpenId(calendar.id)}>{connected ? 'Manage →' : 'Connect →'}</button>
              </article>
            )
          })}
        </div>
      </section>
      {menuId ? <button type="button" className="integ-scrim" aria-label="Close menu" onClick={() => setMenuId('')} /> : null}
      {embedded ? <Button disabled={busy} onClick={finishCalendar}>Continue</Button> : null}
      {error ? <ErrorBlock text={error} /> : null}
      {notice ? <Notice text={notice} /> : null}

      {open ? createPortal(
        <div className="book-back" role="presentation" onClick={() => setOpenId('')}>
          <div className="book-sheet" role="dialog" aria-modal="true" aria-labelledby="calendar-setup-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2 id="calendar-setup-title">{open.label}</h2>
              <button type="button" aria-label="Close" onClick={() => setOpenId('')}>×</button>
            </header>
            <div className="book-body stack">
              {open.id === 'internal' ? (
                <>
                  <form className="stack" onSubmit={saveGrid}>
                    <label className="field"><span>Time zone</span>
                      <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                        {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>Appointment length</span>
                      <select value={slot} onChange={(event) => setSlot(Number(event.target.value))}>
                        {LENGTHS.map((length) => <option key={length} value={length}>{length} minutes</option>)}
                      </select>
                    </label>
                    {windows.map((window, index) => (
                      <div className="check-row" key={`${window.weekday}-${index}`}>
                        <select value={window.weekday} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item))}>
                          {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input type="time" value={window.start} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} required />
                        <input type="time" value={window.end} onChange={(event) => setWindows(windows.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} required />
                        <Button kind="ghost" onClick={() => setWindows(windows.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                      </div>
                    ))}
                    <Button kind="ghost" onClick={() => setWindows([...windows, { weekday: 1, start: '09:00', end: '17:00' }])}>Add window</Button>
                    <Button type="submit" disabled={busy}>Save hours</Button>
                  </form>
                  <form className="stack" onSubmit={createBlock}>
                    <h3>Blocks</h3>
                    <label className="field"><span>Date</span><input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} required /></label>
                    <label className="field"><span>From</span><input type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} required /></label>
                    <label className="field"><span>To</span><input type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} required /></label>
                    <Button type="submit" disabled={busy}>Add block</Button>
                    {blocks.map((block) => (
                      <p key={block.id}>{block.starts_at} <Button kind="ghost" onClick={() => removeBlock(session, block.id).then(() => reload())}>Remove</Button></p>
                    ))}
                  </form>
                </>
              ) : null}
              {open.id === 'square' ? (
                <form className="stack" onSubmit={connectSquare}>
                  <p className="muted">{squareVia === 'oauth'
                    ? 'Square sign-in stays on Square and renews on its own.'
                    : 'Square asks you to allow Detox Pass to read and write appointments. You do not paste a token.'}</p>
                  {locations.length > 1 ? (
                    <label className="field"><span>Location</span>
                      <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                        {locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {members.length > 1 ? (
                    <label className="field"><span>Team member</span>
                      <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                        {members.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {services.length > 1 ? (
                    <label className="field"><span>Service</span>
                      <select value={variationId} onChange={(event) => setVariationId(event.target.value)}>
                        {services.map((row) => <option key={row.variationId} value={row.variationId}>{row.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <Button type="submit" disabled={busy}>{choosing ? 'Save Square service' : 'Connect with Square'}</Button>
                  {squareOn ? (
                    <Button kind="ghost" disabled={busy} onClick={() => {
                      setBusy(true)
                      callFunction(session, 'scheduling-square', { action: 'disconnect', professional_id: schedule.id })
                        .then(() => { setNotice('Square is disconnected here.'); reload() })
                        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not disconnect Square.'))
                        .finally(() => setBusy(false))
                    }}>Disconnect Square</Button>
                  ) : null}
                </form>
              ) : null}
              {open.id !== 'internal' && open.id !== 'square' ? (
                <p>This screen does not connect {open.label} yet.</p>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {priorityOpen ? createPortal(
        <div className="priority-back" role="presentation" onClick={() => setPriorityOpen(false)}>
          <div className="priority-sheet" role="dialog" aria-modal="true" aria-labelledby="priority-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2 id="priority-title">Priority</h2>
              <button type="button" aria-label="Close" onClick={() => setPriorityOpen(false)}>×</button>
            </header>
            <p>The first calendar wins when the same time is open on more than one.</p>
            <ol className="priority-list">
              {order.map((key, index) => {
                const calendar = CALENDARS.find((item) => item.id === key)
                return (
                  <li
                    key={key}
                    draggable
                    onDragStart={() => { drag.current = key }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const from = order.indexOf(drag.current)
                      const to = order.indexOf(key)
                      if (from < 0 || to < 0 || from === to) return
                      const next = [...order]
                      const [item] = next.splice(from, 1)
                      next.splice(to, 0, item)
                      setOrder(next)
                      reorderCalendars(session, next).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not save the priority.'))
                    }}
                  >
                    <b>{index + 1}</b>
                    {calendar ? <img src={calendar.logo} alt="" /> : null}
                    <span>{calendar?.label ?? key}</span>
                    <div>
                      <Button kind="ghost" disabled={index === 0} onClick={() => move(key, -1)}>Up</Button>
                      <Button kind="ghost" disabled={index === order.length - 1} onClick={() => move(key, 1)}>Down</Button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
