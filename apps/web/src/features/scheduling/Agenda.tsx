import { useEffect, useState, type FormEvent } from 'react'
import {
  addBlock,
  callFunction,
  loadBlocks,
  loadHours,
  loadMySchedule,
  removeBlock,
  replaceHours,
  setScheduleChoice,
  setScheduleGrid,
  type MySchedule,
  type Session,
} from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, Notice } from '../../ui'

const DAYS: [number, string][] = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
  [7, 'Sunday'],
]

const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
]

const LENGTHS = [30, 45, 60, 90, 120]

const CALENDARS: { id: string; label: string; ready: boolean }[] = [
  { id: 'internal', label: 'Detox Pass', ready: true },
  { id: 'square', label: 'Square', ready: true },
  { id: 'acuity', label: 'Acuity', ready: false },
  { id: 'wix', label: 'Wix', ready: false },
  { id: 'zenoti', label: 'Zenoti', ready: false },
  { id: 'mindbody', label: 'Mindbody', ready: false },
]

type SquareOption = { id?: string; variationId?: string; name: string; timezone?: string; minutes?: number }

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function zonedInstant(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(guess).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString()
}

type Draft = { weekday: number; start: string; end: string }

export function AgendaManager({ session }: { session: Session }) {
  const [schedule, setSchedule] = useState<MySchedule | null>(null)
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
  const [picked, setPicked] = useState('')
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [accessToken, setAccessToken] = useState('')
  const [locations, setLocations] = useState<SquareOption[]>([])
  const [members, setMembers] = useState<SquareOption[]>([])
  const [services, setServices] = useState<SquareOption[]>([])
  const [locationId, setLocationId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [variationId, setVariationId] = useState('')

  function reload() {
    setLoading(true)
    loadMySchedule(session)
      .then(async (rows) => {
        const row = rows[0] ?? null
        setSchedule(row)
        if (!row) return
        setTimezone(row.schedule_timezone)
        setSlot(row.slot_minutes)
        const [hours, closed] = await Promise.all([loadHours(session, row.id), loadBlocks(session, row.id)])
        setWindows(hours.map((hour) => ({
          weekday: hour.weekday,
          start: minutesToTime(hour.start_minute),
          end: minutesToTime(hour.end_minute),
        })))
        setBlocks(closed)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the calendar.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [session])

  async function chooseInternal() {
    setBusy(true)
    setError('')
    setPicked('internal')
    try {
      await setScheduleChoice(session, 'internal', true)
      setNotice('Detox Pass calendar is on. Clients book the hours you publish here.')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the calendar.')
    } finally {
      setBusy(false)
    }
  }

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
      const result = await callFunction(session, 'scheduling-square', {
        action: 'connect',
        professional_id: schedule.id,
        environment,
        access_token: accessToken,
        location_id: locationId || undefined,
        team_member_id: memberId || undefined,
        service_variation_id: variationId || undefined,
      })
      const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : {}
      if (body.status === 'choose') {
        applyChoices(body)
        setNotice('Square has more than one option. Pick the location, person, and service, then save again.')
        return
      }
      if (!body.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Square did not connect.')
      setAccessToken('')
      setLocations([])
      setMembers([])
      setServices([])
      setPicked('')
      const service = body.service && typeof body.service === 'object' ? body.service as SquareOption : null
      setNotice(`Square is connected${service?.name ? `: ${service.name}` : ''}. It stays pending until a live booking is completed.`)
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
      await setScheduleGrid(session, timezone, slot)
      await replaceHours(session, schedule.id, next)
      setNotice('Weekly hours saved. Clients only see openings inside these windows.')
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
      setNotice('Block saved. A block over a live reservation is refused.')
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the block.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingBlock text="Loading your calendar…" />
  if (!schedule) return <EmptyBlock title="No professional profile" text="This account is not a professional yet." />

  const source = (schedule.schedule_connections ?? []).find((row) => row.is_source)?.provider ?? ''
  const activeCalendar = schedule.schedule_mode === 'internal' ? 'internal' : source
  const shown = picked || activeCalendar

  return (
    <div className="stack">
      <section className="account-card">
        <h2>Calendar</h2>
        <p>Pick one calendar. Clients book that one. Square asks only for the access token; the location, person, and service are filled in from the account.</p>
        <div className="shortcuts">
          {CALENDARS.map((calendar) => (
            <Button
              key={calendar.id}
              kind={shown === calendar.id ? 'primary' : 'ghost'}
              disabled={busy}
              onClick={() => calendar.id === 'internal' ? chooseInternal() : setPicked(calendar.id)}
            >
              {calendar.label}{activeCalendar === calendar.id ? ' · on' : ''}
            </Button>
          ))}
        </div>
        {picked && picked !== 'internal' && picked !== 'square' ? (
          <p className="muted">{CALENDARS.find((calendar) => calendar.id === picked)?.label} is listed, and this screen does not connect it yet.</p>
        ) : null}
        {activeCalendar === 'square' && picked !== 'square' ? (
          <p className="muted">Square is the calendar clients book. The token is stored and is not shown again.</p>
        ) : null}
      </section>
      {picked === 'square' ? (
        <form className="account-card" onSubmit={connectSquare}>
          <h2>Square</h2>
          <label className="field"><span>Environment</span>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value === 'production' ? 'production' : 'sandbox')}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Live</option>
            </select>
          </label>
          <label className="field"><span>Access token</span>
            <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} autoComplete="off" required />
          </label>
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
          <Button type="submit" disabled={busy || accessToken.trim() === ''}>Connect Square</Button>
        </form>
      ) : null}
      {schedule.schedule_mode === 'internal' ? (
        <>
          <form className="account-card" onSubmit={saveGrid}>
            <h2>Weekly hours</h2>
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
          <form className="account-card" onSubmit={createBlock}>
            <h2>Blocks</h2>
            <p className="muted">Times use {timezone}. A block that covers a live reservation is refused.</p>
            <label className="field"><span>Date</span><input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} required /></label>
            <label className="field"><span>From</span><input type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} required /></label>
            <label className="field"><span>To</span><input type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} required /></label>
            <Button type="submit" disabled={busy}>Add block</Button>
            {blocks.length === 0 ? <EmptyBlock title="No blocks" text="Open hours stay bookable until you block them." /> : (
              <ul className="stack">
                {blocks.map((block) => (
                  <li key={block.id}>
                    <span>{block.starts_at} → {block.ends_at}</span>
                    <Button kind="ghost" onClick={() => removeBlock(session, block.id).then(() => reload()).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not remove the block.'))}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </>
      ) : null}
      {error ? <ErrorBlock text={error} /> : null}
      {notice ? <Notice text={notice} /> : null}
    </div>
  )
}
