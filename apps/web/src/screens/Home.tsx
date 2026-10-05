import { useEffect, useState } from 'react'
import { catalog, type ProfessionalRow, type Session } from '../lib/supabase'
import { Professional, money, type Offer, type Therapist } from './Professional'
import { Button, Icon } from '../ui'

type Portrait = { id: string; photo: string }

const reelOffsets = [0, 2, 4, 1, 3]

function reelHalf(photos: Portrait[], offset: number) {
  const start = offset % photos.length
  const rotated = [...photos.slice(start), ...photos.slice(0, start)]
  if (rotated.length >= 4) return rotated
  const half: Portrait[] = []
  while (half.length < 4) half.push(...rotated)
  return half
}

function HeroReel({ photos }: { photos: Portrait[] }) {
  if (photos.length === 0) return null
  return (
    <div className="hero-reel" aria-hidden="true">
      {reelOffsets.map((offset, column) => {
        const loop = [...reelHalf(photos, offset), ...reelHalf(photos, offset)]
        return (
          <div className="hero-col" key={column}>
            {loop.map((photo, index) => (
              <img key={`${photo.id}-${index}`} src={photo.photo} alt="" width={240} height={320} decoding="async" draggable={false} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function toCard(row: ProfessionalRow): Therapist {
  const services = (row.professional_services ?? []).map((item) => item.services).filter((item): item is NonNullable<typeof item> => Boolean(item))
  const offers: Offer[] = services.map((item) => ({
    name: item.name,
    price: item.price_cents,
    currency: item.currency,
  }))
  const city = (row.professional_cities ?? []).map((item) => item.cities?.name).find(Boolean) ?? ''
  return {
    id: row.id,
    name: row.display_name,
    photo: row.portrait_path || '/people/splash.jpg',
    offers,
    city,
  }
}

function fromPrice(offers: Offer[]) {
  const amounts = offers.filter((offer) => offer.price != null && offer.currency)
  if (amounts.length === 0) return 'Price pending'
  const lowest = amounts.reduce((best, offer) => ((offer.price ?? 0) < (best.price ?? 0) ? offer : best))
  return amounts.length > 1 ? `From ${money(lowest.price ?? 0, lowest.currency ?? 'USD')}` : money(lowest.price ?? 0, lowest.currency ?? 'USD')
}

export function Home({ session }: { session: Session }) {
  const [cards, setCards] = useState<Therapist[]>([])
  const [loved, setLoved] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [sort, setSort] = useState<'name' | 'low' | 'high'>('name')
  const [savedOnly, setSavedOnly] = useState(false)

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

  const portraits = cards.filter((item, index) => item.photo && cards.findIndex((other) => other.photo === item.photo) === index)
  const serviceOptions = [...new Set(cards.flatMap((item) => item.offers.map((offer) => offer.name)))].sort()
  const cityOptions = [...new Set(cards.map((item) => item.city).filter(Boolean))].sort()
  const priceValues = cards.flatMap((item) => item.offers.map((offer) => offer.price)).filter((price): price is number => price != null).map((cents) => Math.round(cents / 100))
  const priceFloor = priceValues.length ? Math.min(...priceValues) : 0
  const priceCeil = priceValues.length ? Math.max(...priceValues) : 0
  const priceCap = maxPrice == null ? priceCeil : Math.min(maxPrice, priceCeil)

  function lowest(item: Therapist) {
    const amounts = item.offers.map((offer) => offer.price).filter((price): price is number => price != null)
    return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY
  }

  const visible = cards.filter((item) => {
    const blob = `${item.name} ${item.offers.map((offer) => offer.name).join(' ')} ${item.city}`.toLowerCase()
    if (query.trim() && !blob.includes(query.trim().toLowerCase())) return false
    if (cities.length > 0 && !cities.includes(item.city)) return false
    if (services.length > 0 && !item.offers.some((offer) => services.includes(offer.name))) return false
    if (savedOnly && !loved.includes(item.id)) return false
    if (priceValues.length > 1 && lowest(item) / 100 > priceCap) return false
    return true
  }).sort((a, b) => {
    if (sort === 'low') return lowest(a) - lowest(b) || a.name.localeCompare(b.name)
    if (sort === 'high') return lowest(b) - lowest(a) || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  })

  const filtersOn = Boolean(query.trim()) || services.length > 0 || cities.length > 0 || savedOnly || (priceValues.length > 1 && priceCap < priceCeil)

  function serviceLabel(name: string) {
    const matches = cards.flatMap((item) => item.offers.filter((offer) => offer.name === name && offer.price != null && offer.currency))
    if (matches.length === 0) return name
    const lowest = matches.reduce((best, offer) => ((offer.price ?? 0) < (best.price ?? 0) ? offer : best))
    const priced = money(lowest.price ?? 0, lowest.currency ?? 'USD')
    const same = matches.every((offer) => offer.price === lowest.price && offer.currency === lowest.currency)
    return same ? `${name} · ${priced}` : `${name} · from ${priced}`
  }

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  function clearFilters() {
    setQuery('')
    setServices([])
    setCities([])
    setMaxPrice(null)
    setSort('name')
    setSavedOnly(false)
  }

  function open(id: string) {
    setSelectedId(id)
    document.querySelector('.shell-scroll')?.scrollTo({ top: 0 })
  }

  const selected = cards.find((item) => item.id === selectedId) ?? null
  if (selected) {
    return (
      <Professional
        therapist={selected}
        others={cards.filter((item) => item.id !== selected.id)}
        loved={loved.includes(selected.id)}
        onBack={() => setSelectedId(null)}
        onOpen={open}
        onToggleLove={() => setLoved((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])}
      />
    )
  }

  return (
    <>
      <section className="hero-banner">
      <section className={portraits.length ? 'hero has-reel' : 'hero'}>
        <div className="hero-bg">
          <HeroReel photos={portraits} />
        </div>
        <div className="hero-copy">
          <span className="hero-search"><Icon name="search" /></span>
          <h1>Find your perfect therapist</h1>
          <p>Experience professional massage therapy tailored to your needs, delivered by certified experts in your area.</p>
          <form className="hero-bar" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, location or service" />
            <Button type="submit"><Icon name="search" /> Search</Button>
          </form>
        </div>
      </section>
        <section className="finder" aria-label="Filters">
          <div className="finder-bar">
            <label className="finder-sort">
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value as 'name' | 'low' | 'high')} aria-label="Sort">
                <option value="name">Name</option>
                <option value="low">Lowest price</option>
                <option value="high">Highest price</option>
              </select>
            </label>
            <button type="button" className={savedOnly ? 'chip on' : 'chip'} aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)}>Saved</button>
            {cityOptions.map((city) => (
              <button key={city} type="button" className={cities.includes(city) ? 'chip on' : 'chip'} aria-pressed={cities.includes(city)} onClick={() => toggle(cities, city, setCities)}>{city}</button>
            ))}
            {serviceOptions.map((name) => (
              <button key={name} type="button" className={services.includes(name) ? 'chip on' : 'chip'} aria-pressed={services.includes(name)} onClick={() => toggle(services, name, setServices)}>{serviceLabel(name)}</button>
            ))}
            {priceValues.length > 1 ? (
              <label className="finder-price">
                Up to <strong>{money(priceCap * 100, 'USD')}</strong>
                <input type="range" min={priceFloor} max={priceCeil} step={10} value={priceCap} onChange={(event) => setMaxPrice(Number(event.target.value))} aria-label={`Up to ${priceCap} dollars`} />
              </label>
            ) : null}
            {filtersOn ? <button type="button" className="chip" onClick={clearFilters}>Clear</button> : null}
          </div>
        </section>
      </section>
      <div className="page">
        <div className="section-title">
          <h2>Featured therapists</h2>
          {!loading && !error ? <p className="muted">{visible.length} {visible.length === 1 ? 'therapist' : 'therapists'}</p> : null}
        </div>
        {loading ? <p className="muted">Loading the catalog.</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <p className="finder-empty">No therapists match these filters. <button type="button" className="link" onClick={clearFilters}>Clear filters</button></p>
        ) : null}
        <div className="cards">
          {visible.map((item) => (
            <article key={item.id} className="tcard" onClick={() => open(item.id)}>
              <img src={item.photo} alt="" />
              <button type="button" className={loved.includes(item.id) ? 'heart on' : 'heart'} aria-label="Favorite" onClick={(event) => { event.stopPropagation(); setLoved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) }}>
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
      </div>
    </>
  )
}
