import { useEffect, useState } from 'react'
import { catalog, type ProfessionalRow, type Session } from '../lib/supabase'
import { Button, Field, Icon } from '../ui'

type Card = {
  id: string
  name: string
  photo: string
  price: number | null
  currency: string | null
  tags: string[]
  city: string
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}

function toCard(row: ProfessionalRow): Card {
  const services = (row.professional_services ?? []).map((item) => item.services).filter((item): item is NonNullable<typeof item> => Boolean(item))
  const priced = services.find((item) => item.price_cents && item.currency)
  const city = (row.professional_cities ?? []).map((item) => item.cities?.name).find(Boolean) ?? ''
  return {
    id: row.id,
    name: row.display_name,
    photo: row.portrait_path || '/people/splash.jpg',
    price: priced?.price_cents ?? null,
    currency: priced?.currency ?? null,
    tags: services.map((item) => item.name),
    city,
  }
}

export function Home({ session }: { session: Session }) {
  const [cards, setCards] = useState<Card[]>([])
  const [loved, setLoved] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Card | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [service, setService] = useState('All')
  const [maxPrice, setMaxPrice] = useState(200)

  useEffect(() => {
    let alive = true
    catalog(session)
      .then((rows) => {
        if (!alive) return
        setCards(rows.map(toCard))
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Could not load the catalog.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [session])

  const services = [...new Set(cards.flatMap((item) => item.tags))]
  const visible = cards.filter((item) => {
    const blob = `${item.name} ${item.tags.join(' ')} ${item.city}`.toLowerCase()
    if (query.trim() && !blob.includes(query.trim().toLowerCase())) return false
    if (service !== 'All' && !item.tags.includes(service)) return false
    if (item.price != null && item.price / 100 > maxPrice) return false
    return true
  })

  if (selected) {
    return (
      <div className="page">
        <button type="button" className="back" onClick={() => setSelected(null)}><Icon name="back" /> Back to results</button>
        <div className="profile-grid">
          <img className="portrait" src={selected.photo} alt="" />
          <div>
            <h1>{selected.name}</h1>
            <p><Icon name="pin" /> {selected.city || 'City not set'}</p>
            {selected.price != null && selected.currency ? <p className="price">{money(selected.price, selected.currency)}</p> : <p className="muted">Price not set by the operation.</p>}
            <h3>Main services</h3>
            <div className="tags">{selected.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
            <p className="muted">Availability comes from the professional's calendar. None is connected yet, so this screen does not offer a time.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <section className="hero">
        <span className="hero-search"><Icon name="search" /></span>
        <h1>Find your perfect therapist</h1>
        <p>Experience professional massage therapy tailored to your needs, delivered by certified experts in your area.</p>
        <form className="hero-bar" onSubmit={(event) => event.preventDefault()}>
          <Icon name="search" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, location or service" />
          <Button type="submit"><Icon name="search" /> Search</Button>
        </form>
      </section>
      <div className="page">
        <div className="filters">
          <Field label="Service type">
            <select value={service} onChange={(event) => setService(event.target.value)}>
              <option>All</option>
              {services.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label={`Price range · up to $ ${maxPrice}`}>
            <input type="range" min={50} max={200} step={10} value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} />
          </Field>
        </div>
        <div className="section-title"><h2>Featured therapists</h2></div>
        {loading ? <p className="muted">Loading the catalog.</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && visible.length === 0 ? <p className="muted">No therapists match this search.</p> : null}
        <div className="cards">
          {visible.map((item) => (
            <article key={item.id} className="tcard" onClick={() => setSelected(item)}>
              <img src={item.photo} alt="" />
              <button type="button" className={loved.includes(item.id) ? 'heart on' : 'heart'} aria-label="Favorite" onClick={(event) => { event.stopPropagation(); setLoved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) }}>
                <Icon name="heart" />
              </button>
              <div className="tmeta">
                <strong>{item.name}</strong>
                <span>{item.price != null && item.currency ? money(item.price, item.currency) : 'Price pending'}</span>
              </div>
              <div className="tags">{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
              <small><Icon name="pin" /> {item.city || 'City not set'}</small>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
