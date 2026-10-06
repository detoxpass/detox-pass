import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { callFunction, type Session } from '../../lib/supabase'
import { Button, ErrorBlock, Icon, LoadingBlock, PendingBlock } from '../../ui'
import { formatClock, formatMonth, formatReviewDate, formatWhen, monthCells, monthOf, shiftMonth } from './when'

type Offer = { id: string; name: string; price: number | null; currency: string | null }
type City = { id: string; name: string }
type Step = 'service' | 'date' | 'time' | 'review'

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

function priceOf(offer: Offer | undefined) {
  return offer?.price != null && offer.currency ? money(offer.price, offer.currency) : ''
}

export function BookingPanel({ session, professionalId, name, photo, minutes, offers, cities, onReserved }: {
  session: Session
  professionalId: string
  name: string
  photo: string
  minutes: number | null
  offers: Offer[]
  cities: City[]
  onReserved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('service')
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
  const price = priceOf(service)
  const length = minutes ? `${minutes} min` : ''

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
    if (!open) return
    let alive = true
    setLoading(true)
    setError('')
    setPendingCalendar(false)
    callFunction(session, 'scheduling-offer', { action: 'dates', professional_id: professionalId, month })
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
  }, [session, professionalId, month, reload, open])

  async function pickDay(next: string) {
    setDay(next)
    setChosen('')
    setTimes([])
    setError('')
    setBusy(true)
    try {
      const result = await callFunction(session, 'scheduling-offer', { action: 'availability', professional_id: professionalId, date: next })
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
      const result = await callFunction(session, 'scheduling-offer', {
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
    setStep('service')
  }

  function openSheet() {
    setStep('service')
    setNotice('')
    setError('')
    setLoading(true)
    setDates([])
    setOpen(true)
  }

  function back() {
    if (step === 'review') setStep('time')
    else if (step === 'time') setStep('date')
    else if (step === 'date') setStep('service')
  }

  function forward() {
    if (step === 'service') setStep('date')
    else if (step === 'date') setStep('time')
    else if (step === 'time') setStep('review')
  }

  if (offers.length === 0 || cities.length === 0) {
    return <PendingBlock text="This professional has no service and city linked yet, so no time is offered." />
  }

  const canForward = step === 'service' ? Boolean(serviceId && cityId) : step === 'date' ? Boolean(day) : Boolean(chosen)
  const reserveLabel = price ? `Reserve · ${price}` : 'Reserve'
  const confirmLabel = price ? `Confirm reservation · ${price}` : 'Confirm reservation'

  const sheet = (
    <div className="book-back" role="presentation" onClick={close}>
      <div className="book-sheet" role="dialog" aria-modal="true" aria-labelledby="reserve-title" onClick={(event) => event.stopPropagation()}>
        <header className="book-head">
          {!notice && step !== 'service' ? (
            <button type="button" className="book-icon book-back-btn" aria-label="Back" onClick={back}><Icon name="back" /></button>
          ) : <span className="book-icon book-back-btn" />}
          <div className="book-who">
            <img src={photo} alt="" />
            <div>
              <h2 id="reserve-title">Reserve with {name}</h2>
              <p><Icon name="pin" /> {city?.name}</p>
            </div>
          </div>
          <button type="button" className="book-icon" aria-label="Close" onClick={close}><Icon name="close" /></button>
        </header>

        {notice ? (
          <Done name={name} when={formatWhen(notice)} onSessions={onReserved ? () => { close(); onReserved() } : undefined} onClose={close} />
        ) : (
          <>
            <Stepper step={step} />
            <div className="book-body">
              <div className="book-mobile">
                {step === 'service' ? <ServiceStep offers={offers} serviceId={serviceId} cityId={cityId} cities={cities} length={length} onService={setServiceId} onCity={setCityId} /> : null}
                {step === 'date' ? <DateStep month={month} dates={dates} day={day} loading={loading} pendingCalendar={pendingCalendar} error={error} onMonth={(delta) => { setMonth(shiftMonth(month, delta)); setDay(''); setTimes([]); setChosen('') }} onDay={pickDay} onRetry={() => setReload((value) => value + 1)} /> : null}
                {step === 'time' ? <TimeStep day={day} times={times} chosen={chosen} busy={busy} pendingCalendar={pendingCalendar} onPick={setChosen} /> : null}
                {step === 'review' ? <Review service={service?.name} price={price} length={length} day={day} time={chosen} city={city?.name} onEdit={setStep} /> : null}
                {error && step !== 'date' ? <ErrorBlock text={error} /> : null}
              </div>
              <div className="book-desk">
                <ServicePills offers={offers} serviceId={serviceId} length={length} onService={setServiceId} />
                {cities.length > 1 ? (
                  <div className="book-pills">
                    {cities.map((item) => (
                      <button type="button" key={item.id} className={item.id === cityId ? 'on' : ''} aria-pressed={item.id === cityId} onClick={() => setCityId(item.id)}>{item.name}</button>
                    ))}
                  </div>
                ) : null}
                <div className="book-split">
                  <DateStep month={month} dates={dates} day={day} loading={loading} pendingCalendar={pendingCalendar} error={error} onMonth={(delta) => { setMonth(shiftMonth(month, delta)); setDay(''); setTimes([]); setChosen('') }} onDay={pickDay} onRetry={() => setReload((value) => value + 1)} />
                  <TimeStep day={day} times={times} chosen={chosen} busy={busy} pendingCalendar={pendingCalendar} onPick={setChosen} />
                </div>
              </div>
            </div>
            <footer className="book-foot">
              <div className="book-summary">
                <strong>{chosen && service ? `${service.name} · ${formatWhen(chosen)}` : 'Choose an open time.'}</strong>
                <span>{length ? `${length} session` : 'The price stays on the service.'}</span>
              </div>
              {price ? <strong className="book-price">{price}</strong> : null}
              <div className="book-actions">
                <button type="button" className="book-go book-go-step" disabled={!canForward || busy} onClick={step === 'review' ? reserve : forward}>{busy ? 'Please wait' : step === 'review' ? confirmLabel : 'Continue'}</button>
                <button type="button" className="book-go book-go-desk" disabled={!chosen || busy} onClick={reserve}>{busy ? 'Please wait' : reserveLabel}</button>
              </div>
              <p className="book-pay">Payment is not taken here.</p>
            </footer>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <section className="reserve-card">
        <div>
          <h2>Book a session</h2>
          <p>Choose a service and an open time. The price stays on the service. This step does not take payment.</p>
        </div>
        <Button onClick={openSheet}>Reserve</Button>
      </section>
      {open ? createPortal(sheet, document.body) : null}
    </>
  )
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { id: 'service', label: 'Service' },
    { id: 'date', label: 'Date' },
    { id: 'time', label: 'Time' },
  ] as const
  const order = items.findIndex((item) => item.id === step)
  const current = order === -1 ? 3 : order
  return (
    <ol className="book-steps">
      {items.map((item, index) => (
        <li key={item.id} className={index < current ? 'done' : index === current ? 'now' : ''}>
          <span>{index < current ? '✓' : index + 1}</span>
          {item.label}
        </li>
      ))}
    </ol>
  )
}

function ServiceStep({ offers, serviceId, cityId, cities, length, onService, onCity }: {
  offers: Offer[]
  serviceId: string
  cityId: string
  cities: City[]
  length: string
  onService: (id: string) => void
  onCity: (id: string) => void
}) {
  return (
    <div className="book-block">
      <h3>Select a service</h3>
      <div className="book-services">
        {offers.map((offer) => {
          const on = offer.id === serviceId
          const amount = priceOf(offer)
          return (
            <button type="button" key={offer.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onService(offer.id)}>
              <span>
                <strong>{offer.name}</strong>
                {length ? <small>{length}</small> : null}
              </span>
              <em>{amount || 'Price pending'}</em>
              <i aria-hidden="true">{on ? '✓' : ''}</i>
            </button>
          )
        })}
      </div>
      {cities.length > 1 ? (
        <div className="book-pills">
          {cities.map((item) => (
            <button type="button" key={item.id} className={item.id === cityId ? 'on' : ''} aria-pressed={item.id === cityId} onClick={() => onCity(item.id)}>{item.name}</button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ServicePills({ offers, serviceId, length, onService }: {
  offers: Offer[]
  serviceId: string
  length: string
  onService: (id: string) => void
}) {
  return (
    <div className="book-pills book-pills-wide">
      {offers.map((offer) => {
        const on = offer.id === serviceId
        const amount = priceOf(offer)
        return (
          <button type="button" key={offer.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onService(offer.id)}>
            <span>{on ? '✓ ' : ''}{offer.name}</span>
            <small>{[length, amount || 'Price pending'].filter(Boolean).join(' · ')}</small>
          </button>
        )
      })}
    </div>
  )
}

function DateStep({ month, dates, day, loading, pendingCalendar, error, onMonth, onDay, onRetry }: {
  month: string
  dates: string[]
  day: string
  loading: boolean
  pendingCalendar: boolean
  error: string
  onMonth: (delta: number) => void
  onDay: (date: string) => void
  onRetry: () => void
}) {
  const open = new Set(dates)
  return (
    <div className="book-block">
      <div className="book-month">
        <h3>Select a date</h3>
        <div>
          <strong>{formatMonth(month)}</strong>
          <button type="button" aria-label="Previous month" onClick={() => onMonth(-1)}><Icon name="back" /></button>
          <button type="button" className="book-next" aria-label="Next month" onClick={() => onMonth(1)}><Icon name="back" /></button>
        </div>
      </div>
      <div className="book-week" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => <span key={label}>{label}</span>)}</div>
      {loading ? <LoadingBlock text="Checking the calendar…" /> : null}
      {pendingCalendar ? <PendingBlock text="This professional has not published an open time yet." /> : null}
      {!loading && !pendingCalendar ? (
        <div className="book-grid">
          {monthCells(month).map((cell) => {
            if (!cell.date || !cell.day) return <span key={cell.key} />
            const available = open.has(cell.date)
            return (
              <button type="button" key={cell.key} className={cell.date === day ? 'on' : available ? 'open' : ''} disabled={!available} aria-pressed={cell.date === day} onClick={() => onDay(cell.date!)}>
                {cell.day}
              </button>
            )
          })}
        </div>
      ) : null}
      {!loading && !pendingCalendar && dates.length === 0 && !error ? <p className="muted">No openings this month.</p> : null}
      <p className="book-legend"><i /> Available <b /> Unavailable</p>
      {error ? <ErrorBlock text={error} onRetry={onRetry} /> : null}
    </div>
  )
}

function TimeStep({ day, times, chosen, busy, pendingCalendar, onPick }: {
  day: string
  times: string[]
  chosen: string
  busy: boolean
  pendingCalendar: boolean
  onPick: (time: string) => void
}) {
  const am = times.filter((time) => new Date(time).getHours() < 12)
  const pm = times.filter((time) => new Date(time).getHours() >= 12)
  return (
    <div className="book-block">
      <h3>Select a time</h3>
      {day ? <p className="book-day">{formatReviewDate(day)}</p> : <p className="muted">Select a date to see open times.</p>}
      {busy && times.length === 0 ? <LoadingBlock text="Checking times…" /> : null}
      {pendingCalendar ? <PendingBlock text="This professional has not published an open time yet." /> : null}
      {day && !busy && times.length === 0 && !pendingCalendar ? <p className="muted">No open times that day.</p> : null}
      <TimeGroup label="AM" times={am} chosen={chosen} onPick={onPick} />
      <TimeGroup label="PM" times={pm} chosen={chosen} onPick={onPick} />
    </div>
  )
}

function TimeGroup({ label, times, chosen, onPick }: { label: string; times: string[]; chosen: string; onPick: (time: string) => void }) {
  if (times.length === 0) return null
  return (
    <>
      <p className="book-meridiem">{label}</p>
      <div className="book-times">
        {times.map((time) => (
          <button type="button" key={time} className={time === chosen ? 'on' : ''} aria-pressed={time === chosen} onClick={() => onPick(time)}>{formatClock(time)}</button>
        ))}
      </div>
    </>
  )
}

function Review({ service, price, length, day, time, city, onEdit }: {
  service: string | undefined
  price: string
  length: string
  day: string
  time: string
  city: string | undefined
  onEdit: (step: Step) => void
}) {
  const rows = [
    { step: 'service' as const, label: 'Service', value: [service, price, length].filter(Boolean).join(' · ') },
    { step: 'date' as const, label: 'Date', value: day ? formatReviewDate(day) : '' },
    { step: 'time' as const, label: 'Time', value: time ? formatClock(time) : '' },
  ]
  return (
    <div className="book-block">
      <h3>Review your reservation</h3>
      {rows.map((row) => (
        <div className="book-review" key={row.step}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <button type="button" onClick={() => onEdit(row.step)}>Edit</button>
        </div>
      ))}
      <div className="book-review">
        <span>Location</span>
        <strong>{city}</strong>
      </div>
    </div>
  )
}

function Done({ name, when, onSessions, onClose }: { name: string; when: string; onSessions?: () => void; onClose: () => void }) {
  return (
    <div className="book-done" aria-live="polite">
      <div className="book-burst" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
        <i>✓</i>
      </div>
      <h3>Reservation confirmed!</h3>
      <p>Your session with {name} is booked for {when}.</p>
      <p className="book-pay">Payment is not taken here. You can see this in My sessions.</p>
      {onSessions ? <button type="button" className="book-go" onClick={onSessions}>View my sessions</button> : null}
      <button type="button" className="book-later" onClick={onClose}>Done</button>
    </div>
  )
}
