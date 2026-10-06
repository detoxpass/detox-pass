import { useEffect, useState } from 'react'
import { calendarDoor, callFunction, type Session } from '../../lib/supabase'
import { Button, ErrorBlock, Icon, LoadingBlock, PendingBlock } from '../../ui'
import { formatClock, formatDay, formatMonth, formatWhen, monthOf, shiftMonth } from './when'

type Offer = { id: string; name: string; price: number | null; currency: string | null }
type City = { id: string; name: string }

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
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

export function BookingPanel({ session, professionalId, offers, cities, mode, source, onReserved }: {
  session: Session
  professionalId: string
  offers: Offer[]
  cities: City[]
  mode: 'internal' | 'external' | null
  source: string | null
  onReserved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [serviceId, setServiceId] = useState(offers[0]?.id ?? '')
  const [cityId, setCityId] = useState(cities[0]?.id ?? '')
  const [month, setMonth] = useState(monthOf(new Date()))
  const [dates, setDates] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [times, setTimes] = useState<string[]>([])
  const [chosen, setChosen] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingCalendar, setPendingCalendar] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  const service = offers.find((offer) => offer.id === serviceId) ?? offers[0]
  const city = cities.find((item) => item.id === cityId) ?? cities[0]
  const door = calendarDoor(mode === 'internal' ? 'internal' : source)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false)
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy])

  useEffect(() => {
    if (!open || !mode || !door) return
    let alive = true
    setLoading(true)
    setError('')
    setPendingCalendar(false)
    setDay('')
    setTimes([])
    setChosen('')
    callFunction(session, door, { action: 'dates', professional_id: professionalId, month })
      .then((result) => {
        if (!alive) return
        if (pending(result.body) || result.status === 422) {
          setPendingCalendar(true)
          setDates([])
          return
        }
        setDates(datesOf(result.body))
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load the calendar.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [session, professionalId, month, reload, mode, open, door])

  async function pickDay(next: string) {
    if (!door) return
    setDay(next)
    setChosen('')
    setTimes([])
    setError('')
    setBusy(true)
    try {
      const result = await callFunction(session, door, { action: 'availability', professional_id: professionalId, date: next })
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
    if (!door) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await callFunction(session, door, {
        action: 'book',
        professional_id: professionalId,
        service_id: serviceId,
        city_id: cityId,
        starts_at: chosen,
      })
      const body = result.body as { status?: string; booking_id?: string } | null
      if (body?.status === 'provider_confirmed' && body.booking_id) {
        setNotice(chosen)
        setChosen('')
        setReload((value) => value + 1)
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

  function close() {
    if (busy) return
    setOpen(false)
    setNotice('')
    setError('')
  }

  if (mode == null) {
    return <PendingBlock text="This professional has not chosen a calendar yet. No time is offered." />
  }
  if (mode === 'external' && !door) {
    return <PendingBlock text="This external calendar is not the one clients book yet. No time is offered." />
  }
  if (offers.length === 0 || cities.length === 0) {
    return <PendingBlock text="This professional has no service and city linked yet, so no time is offered." />
  }

  const price = service?.price != null && service.currency ? money(service.price, service.currency) : 'Price pending'

  return (
    <>
      <section className="reserve-card">
        <div>
          <h2>Book a session</h2>
          <p>Choose a service and an open time. The price stays on the service. This step does not take payment.</p>
        </div>
        <Button onClick={() => { setLoading(true); setDates([]); setOpen(true) }}>Reserve</Button>
      </section>
      {open ? (
        <div className="book-back" role="presentation" onClick={close}>
          <div className="book-sheet" role="dialog" aria-modal="true" aria-labelledby="reserve-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2 id="reserve-title">{notice ? 'Reserved' : 'Reserve'}</h2>
              <button type="button" aria-label="Close" onClick={close}><Icon name="close" /></button>
            </header>
            {notice ? (
              <div className="book-body book-done">
                <p className="kicker">{service?.name} · {city?.name}</p>
                <strong>{formatWhen(notice)}</strong>
                <p>{price}. Payment is not taken here. You can see this in My sessions.</p>
                <div className="visit-actions">
                  {onReserved ? <Button onClick={() => { close(); onReserved() }}>See my sessions</Button> : null}
                  <Button kind="ghost" onClick={close}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="book-body">
                  {offers.length > 1 ? (
                    <div className="book-step">
                      <span>Service</span>
                      <div className="choice-grid">
                        {offers.map((offer) => (
                          <button type="button" key={offer.id} className={offer.id === serviceId ? 'on' : ''} aria-pressed={offer.id === serviceId} onClick={() => setServiceId(offer.id)}>
                            {offer.name}
                            <small>{offer.price != null && offer.currency ? money(offer.price, offer.currency) : 'Price pending'}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : <p className="book-fact"><span>Service</span><strong>{service?.name}</strong></p>}
                  {cities.length > 1 ? (
                    <div className="book-step">
                      <span>City</span>
                      <div className="choice-grid">
                        {cities.map((item) => (
                          <button type="button" key={item.id} className={item.id === cityId ? 'on' : ''} aria-pressed={item.id === cityId} onClick={() => setCityId(item.id)}>{item.name}</button>
                        ))}
                      </div>
                    </div>
                  ) : <p className="book-fact"><span>City</span><strong>{city?.name}</strong></p>}
                  <div className="book-step">
                    <span>Date</span>
                    <div className="month-row">
                      <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>Prev</button>
                      <strong>{formatMonth(month)}</strong>
                      <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>Next</button>
                    </div>
                    {loading ? <LoadingBlock text="Checking the calendar…" /> : null}
                    {pendingCalendar ? <PendingBlock text={mode === 'internal' ? 'This professional has not published openings on their Detox Pass calendar.' : 'Availability did not come from the external calendar. No time is offered.'} /> : null}
                    {!loading && !pendingCalendar && dates.length === 0 && !error ? <p className="muted">No openings this month.</p> : null}
                    {dates.length > 0 ? (
                      <div className="choice-grid">
                        {dates.map((date) => (
                          <button type="button" key={date} className={date === day ? 'on' : ''} aria-pressed={date === day} onClick={() => pickDay(date)}>{formatDay(date)}</button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {day ? (
                    <div className="book-step">
                      <span>Time</span>
                      {busy && times.length === 0 ? <LoadingBlock text="Checking times…" /> : null}
                      {!busy && times.length === 0 && !pendingCalendar ? <p className="muted">No open times that day.</p> : null}
                      {times.length > 0 ? (
                        <div className="choice-grid times">
                          {times.map((time) => (
                            <button type="button" key={time} className={time === chosen ? 'on' : ''} aria-pressed={time === chosen} onClick={() => setChosen(time)}>{formatClock(time)}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {error ? <ErrorBlock text={error} onRetry={dates.length === 0 ? () => setReload((value) => value + 1) : undefined} /> : null}
                </div>
                <footer className="book-foot">
                  <p>{chosen ? `${service?.name} · ${city?.name} · ${formatWhen(chosen)}` : 'Choose an open time.'}</p>
                  <p className="muted">{price}. The price stays on the service.</p>
                  <Button disabled={!chosen || busy} onClick={reserve}>{busy ? 'Please wait' : 'Reserve'}</Button>
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
