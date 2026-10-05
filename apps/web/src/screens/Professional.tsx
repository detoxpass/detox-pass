import type { ReactNode } from 'react'
import { Icon } from '../ui'

export type Offer = {
  id: string
  name: string
  price: number | null
  currency: string | null
}

export type Place = { id: string; name: string }

export type Therapist = {
  id: string
  name: string
  photo: string
  city: string
  offers: Offer[]
  places: Place[]
}

export function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}

function priced(offers: Offer[]) {
  return offers.filter((offer): offer is Offer & { price: number; currency: string } => offer.price != null && Boolean(offer.currency))
}

function fromLabel(offers: Offer[]) {
  const amounts = priced(offers)
  if (amounts.length === 0) return 'Price pending'
  const lowest = amounts.reduce((best, offer) => (offer.price < best.price ? offer : best))
  const label = money(lowest.price, lowest.currency)
  return amounts.length > 1 ? `From ${label}` : label
}

export function Professional({
  therapist,
  others,
  loved,
  onBack,
  onOpen,
  onToggleLove,
  schedule,
}: {
  therapist: Therapist
  others: Therapist[]
  loved: boolean
  onBack: () => void
  onOpen: (id: string) => void
  onToggleLove: () => void
  schedule?: ReactNode
}) {
  const offers = therapist.offers

  return (
    <div className="page pro">
      <button type="button" className="back" onClick={onBack}><Icon name="back" /> Back to results</button>
      <div className="pro-layout">
        <img className="pro-photo" src={therapist.photo} alt="" />
        <div className="pro-main">
          <p className="kicker">{therapist.city || 'City not set'}</p>
          <h1>{therapist.name}</h1>
          <p className="pro-from">{fromLabel(offers)}</p>
          <div className="pro-actions">
            <button type="button" className={loved ? 'pro-love on' : 'pro-love'} onClick={onToggleLove}>
              <Icon name="heart" /> {loved ? 'Saved' : 'Save'}
            </button>
          </div>
          <section className="pro-block">
            <h2>Services</h2>
            {offers.length === 0 ? <p className="muted">No service is linked to this professional yet.</p> : null}
            <ul className="pro-offers">
              {offers.map((offer) => (
                <li key={offer.id}>
                  <strong>{offer.name}</strong>
                  <span>{offer.price != null && offer.currency ? money(offer.price, offer.currency) : 'Price pending'}</span>
                </li>
              ))}
            </ul>
          </section>
          {schedule ?? (
            <section className="pro-schedule">
              <span className="pro-cal"><Icon name="calendar" /></span>
              <div>
                <h2>Availability</h2>
                <p>This comes from the professional's calendar. None is connected, so no time is offered here.</p>
              </div>
            </section>
          )}
        </div>
      </div>
      {others.length > 0 ? (
        <section className="pro-more">
          <h2>Other therapists</h2>
          <div className="pro-others">
            {others.map((item) => (
              <button type="button" key={item.id} className="pro-mini" onClick={() => onOpen(item.id)}>
                <img src={item.photo} alt="" />
                <strong>{item.name}</strong>
                <small>{item.city || 'City not set'}</small>
                <em>{fromLabel(item.offers)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
