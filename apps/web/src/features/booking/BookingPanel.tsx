import { useEffect, useState } from 'react'
import { callFunction, type Session } from '../../lib/supabase'
import { Button, EmptyBlock, ErrorBlock, LoadingBlock, Notice, PendingBlock } from '../../ui'

type Offer = { id: string; name: string; price: number | null; currency: string | null }
type City = { id: string; name: string }

function monthOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number) {
  const [year, raw] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, raw - 1 + delta, 1))
  return monthOf(next)
}

function timesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('times' in body) || !Array.isArray(body.times)) return []
  return body.times.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('time' in item) || typeof item.time !== 'string') return []
    return [item.time]
  })
}

function datesOf(body: unknown) {
  if (!body || typeof body !== 'object' || !('dates' in body) || !Array.isArray(body.dates)) return []
  return body.dates.filter((item): item is string => typeof item === 'string')
}

function pending(body: unknown) {
  return Boolean(body && typeof body === 'object' && 'supported' in body && body.supported === false)
}

export function BookingPanel({ session, professionalId, offers, cities }: {
  session: Session
  professionalId: string
  offers: Offer[]
  cities: City[]
}) {
  const [serviceId, setServiceId] = useState(offers[0]?.id ?? '')
  const [cityId, setCityId] = useState(cities[0]?.id ?? '')
  const [month, setMonth] = useState(monthOf(new Date()))
  const [dates, setDates] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [times, setTimes] = useState<string[]>([])
  const [chosen, setChosen] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingCalendar, setPendingCalendar] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setPendingCalendar(false)
    setDay('')
    setTimes([])
    setChosen('')
    callFunction(session, 'scheduling-acuity', { action: 'dates', professional_id: professionalId, month })
      .then((result) => {
        if (!alive) return
        if (pending(result.body) || result.status === 422) {
          setPendingCalendar(true)
          return
        }
        setDates(datesOf(result.body))
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load the calendar.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session, professionalId, month, reload])

  async function pickDay(next: string) {
    setDay(next)
    setChosen('')
    setTimes([])
    setError('')
    setBusy(true)
    try {
      const result = await callFunction(session, 'scheduling-acuity', { action: 'availability', professional_id: professionalId, date: next })
      if (pending(result.body) || result.status === 422) {
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

  async function reserve() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await callFunction(session, 'scheduling-acuity', {
        action: 'book',
        professional_id: professionalId,
        service_id: serviceId,
        city_id: cityId,
        starts_at: chosen,
      })
      const body = result.body as { status?: string; booking_id?: string } | null
      if (body?.status === 'provider_confirmed' && body.booking_id) {
        setNotice(`Reserved. Payment is not part of this step. Reference ${body.booking_id}.`)
        setChosen('')
        return
      }
      if (pending(body) || result.status === 422) {
        setError('That time is no longer available.')
        setChosen('')
        if (day) await pickDay(day)
        return
      }
      setError('The reservation was not confirmed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reserve.')
    } finally {
      setBusy(false)
    }
  }

  if (offers.length === 0 || cities.length === 0) {
    return <PendingBlock text="This professional has no service and city linked yet, so no time is offered." />
  }
  if (loading) return <LoadingBlock text="Checking the calendar…" />
  if (pendingCalendar) return <PendingBlock text="Availability did not come from the calendar. No local time is offered." />
  if (error && dates.length === 0 && !day) return <ErrorBlock text={error} onRetry={() => setReload((value) => value + 1)} />

  return (
    <div className="stack">
      <label className="field"><span>Service</span>
        <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
      </label>
      <label className="field"><span>City</span>
        <select value={cityId} onChange={(event) => setCityId(event.target.value)}>
          {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>
      </label>
      <div className="shortcuts">
        <Button kind="ghost" onClick={() => setMonth(shiftMonth(month, -1))}>{shiftMonth(month, -1)}</Button>
        <strong>{month}</strong>
        <Button kind="ghost" onClick={() => setMonth(shiftMonth(month, 1))}>{shiftMonth(month, 1)}</Button>
      </div>
      {dates.length === 0 ? <EmptyBlock title="No openings this month" text="The calendar returned no dates." /> : (
        <div className="day-list">
          {dates.map((date) => (
            <button type="button" key={date} className={date === day ? 'on' : ''} onClick={() => pickDay(date)}>{date}</button>
          ))}
        </div>
      )}
      {day && times.length === 0 && !busy ? <EmptyBlock title="No times that day" text="Pick another date the calendar returned." /> : null}
      {times.length > 0 ? (
        <div className="slot-list">
          {times.map((time) => (
            <button type="button" key={time} className={time === chosen ? 'on' : ''} onClick={() => setChosen(time)}>{time}</button>
          ))}
        </div>
      ) : null}
      {error ? <ErrorBlock text={error} /> : null}
      {notice ? <Notice text={notice} /> : null}
      <Button disabled={!chosen || busy} onClick={reserve}>{busy ? 'Please wait' : 'Reserve'}</Button>
      <p className="muted">The price stays on the service. This step does not take payment.</p>
    </div>
  )
}
