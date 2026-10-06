import { useEffect, useState } from 'react'
import { catalog, type ProfessionalRow, type Session } from '../lib/supabase'
import { readLoved, writeLoved } from '../lib/loved'
import { money, type Offer, type Therapist } from './Professional'
import { Button, ErrorBlock, Icon, LoadingBlock } from '../ui'

function toCard(row: ProfessionalRow): Therapist {
  const offers: Offer[] = (row.professional_services ?? []).flatMap((item) => item.services ? [{
    id: item.services.id,
    name: item.services.name,
    price: item.services.price_cents,
    currency: item.services.currency,
  }] : [])
  const places = (row.professional_cities ?? []).flatMap((item) => item.cities ? [{ id: item.cities.id, name: item.cities.name }] : [])
  return {
    id: row.id,
    name: row.display_name,
    photo: row.portrait_path || '/people/splash.jpg',
    offers,
    places,
    city: places.map((place) => place.name).join(', '),
  }
}

function fromPrice(offers: Offer[]) {
  const amounts = offers.filter((offer) => offer.price != null && offer.currency)
  if (amounts.length === 0) return 'Price pending'
  const lowest = amounts.reduce((best, offer) => ((offer.price ?? 0) < (best.price ?? 0) ? offer : best))
  return amounts.length > 1 ? `From ${money(lowest.price ?? 0, lowest.currency ?? 'USD')}` : money(lowest.price ?? 0, lowest.currency ?? 'USD')
}

export function Favorites({
  session,
  onOpen,
  onFind,
}: {
  session: Session
  onOpen?: (id: string) => void
  onFind?: () => void
}) {
  const [cards, setCards] = useState<Therapist[]>([])
  const [loved, setLoved] = useState<string[]>(readLoved)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    catalog(session)
      .then((rows) => {
        if (alive) setCards(rows.map(toCard))
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load favorites.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [session])

  function unsave(id: string) {
    const next = loved.filter((item) => item !== id)
    writeLoved(next)
    setLoved(next)
  }

  const saved = cards.filter((item) => loved.includes(item.id))
  const hidden = loved.filter((id) => !cards.some((item) => item.id === id)).length

  if (loading) return <div className="page"><LoadingBlock kind="cards" text="Loading favorites…" /></div>

  return (
    <div className="page fav">
      <section className="fav-hero">
        <div>
          <p className="eyebrow">On this device</p>
          <h1>{saved.length === 0 ? 'No saved therapists' : `${saved.length} saved`}</h1>
          <p>Hearts you tap in search stay in this browser. They are not a server list and they are not shared with another account on this phone.</p>
        </div>
        {onFind ? <Button onClick={onFind}>Find a therapist</Button> : null}
      </section>
      {error ? <ErrorBlock text={error} /> : null}
      {saved.length === 0 ? (
        <section className="fav-empty">
          <span className="heart-lg" aria-hidden="true"><Icon name="heart" /></span>
          <h2>Save someone from search</h2>
          <p>Open a therapist and tap the heart. The card comes back to this page on this device.</p>
          {onFind ? <Button kind="soft" onClick={onFind}>Browse therapists</Button> : <p>Search stays on the client account.</p>}
        </section>
      ) : (
        <div className="cards">
          {saved.map((item) => (
            <article key={item.id} className={onOpen ? 'tcard' : 'tcard is-static'} onClick={onOpen ? () => onOpen(item.id) : undefined}>
              <img src={item.photo} alt="" />
              <button type="button" className="heart on" aria-label={`Remove ${item.name}`} onClick={(event) => { event.stopPropagation(); unsave(item.id) }}>
                <Icon name="heart" />
              </button>
              <div className="tmeta">
                <strong>{item.name}</strong>
                <span>{fromPrice(item.offers)}</span>
              </div>
              <div className="tags">{item.offers.map((offer) => <em key={offer.name}>{offer.name}</em>)}</div>
              <small><Icon name="pin" /> {item.city || 'City not set'}</small>
            </article>
          ))}
        </div>
      )}
      {hidden > 0 ? <p className="muted">{hidden} saved {hidden === 1 ? 'profile is' : 'profiles are'} not in search.</p> : null}
    </div>
  )
}
