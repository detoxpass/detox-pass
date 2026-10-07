import { useEffect, useMemo, useRef, useState } from 'react'
import { catalog, type ProfessionalRow, type Session } from '../lib/supabase'
import { readLoved, writeLoved } from '../lib/loved'
import { money, type Offer, type Therapist } from './Professional'
import { Button, Icon, LoadingBlock } from '../ui'

type Portrait = { id: string; photo: string }
type Specialty = { id: string; name: string }
type HomeCard = Therapist & { specialties: Specialty[] }
type Band = { id: string; title: string; total: number; items: HomeCard[] }

const PAGE = 8
const REEL_COLUMNS = 6
const REEL_CHUNK = 4

function shufflePortraits(photos: Portrait[], seed: number) {
  const copy = [...photos]
  let state = seed >>> 0
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = state % (index + 1)
    const current = copy[index]
    copy[index] = copy[swap]
    copy[swap] = current
  }
  return copy
}

function reelWindow(photos: Portrait[], start: number, count: number) {
  const window: Portrait[] = []
  if (photos.length === 0) return window
  for (let index = 0; index < count; index += 1) window.push(photos[(start + index) % photos.length])
  return window
}

function HeroColumn({ photos, seed }: { photos: Portrait[]; seed: number }) {
  const deck = useMemo(() => shufflePortraits(photos, seed), [photos, seed])
  const [cursor, setCursor] = useState(0)
  const loop = [...reelWindow(deck, cursor, REEL_CHUNK), ...reelWindow(deck, cursor + REEL_CHUNK, REEL_CHUNK)]

  return (
    <div className="hero-col" onAnimationIteration={() => setCursor((current) => (current + REEL_CHUNK) % deck.length)}>
      {loop.map((photo, index) => (
        <img key={index} src={photo.photo} alt="" width={480} height={640} decoding="async" draggable={false} />
      ))}
    </div>
  )
}

function HeroReel({ photos }: { photos: Portrait[] }) {
  if (photos.length === 0) return null
  return (
    <div className="hero-reel" aria-hidden="true">
      {Array.from({ length: REEL_COLUMNS }, (_, column) => (
        <HeroColumn key={column} photos={photos} seed={(column + 1) * 997} />
      ))}
    </div>
  )
}

function toCard(row: ProfessionalRow): HomeCard {
  const offers: Offer[] = (row.professional_services ?? []).flatMap((item) => item.services ? [{
    id: item.services.id,
    name: item.services.name,
    price: item.services.price_cents,
    currency: item.services.currency,
  }] : [])
  const places = (row.professional_cities ?? []).flatMap((item) => item.cities ? [{ id: item.cities.id, name: item.cities.name }] : [])
  const specialties = (row.professional_specialties ?? []).flatMap((item) => item.specialties ? [item.specialties] : [])
  return {
    id: row.id,
    name: row.display_name,
    photo: row.portrait_path || '/people/splash.jpg',
    offers,
    places,
    city: places.map((place) => place.name).join(', '),
    specialties,
  }
}

function fromPrice(offers: Offer[]) {
  const amounts = offers.filter((offer) => offer.price != null && offer.currency)
  if (amounts.length === 0) return 'Price pending'
  const lowest = amounts.reduce((best, offer) => ((offer.price ?? 0) < (best.price ?? 0) ? offer : best))
  return amounts.length > 1 ? `From ${money(lowest.price ?? 0, lowest.currency ?? 'USD')}` : money(lowest.price ?? 0, lowest.currency ?? 'USD')
}

function bandsOf(items: HomeCard[]): Band[] {
  const groups = new Map<string, { title: string; items: HomeCard[] }>()
  const loose: HomeCard[] = []
  for (const item of items) {
    if (item.specialties.length === 0) {
      loose.push(item)
      continue
    }
    for (const specialty of item.specialties) {
      const group = groups.get(specialty.id) ?? { title: specialty.name, items: [] }
      group.items.push(item)
      groups.set(specialty.id, group)
    }
  }
  const bands = [...groups.entries()].map(([id, group]) => ({
    id,
    title: group.title,
    total: group.items.length,
    items: group.items.slice(0, PAGE),
  })).sort((a, b) => a.title.localeCompare(b.title))
  if (loose.length > 0) {
    bands.push({ id: 'more', title: 'More therapists', total: loose.length, items: loose.slice(0, PAGE) })
  }
  return bands
}

function ProCards({ items, loved, lazy, onOpen, onLove }: {
  items: HomeCard[]
  loved: string[]
  lazy: boolean
  onOpen: (id: string) => void
  onLove: (id: string) => void
}) {
  return (
    <div className="cards">
      {items.map((item) => (
        <article key={item.id} className="tcard pro-card" onClick={() => onOpen(item.id)}>
          <span className="pro-shot">
            <img src={item.photo} alt="" loading={lazy ? 'lazy' : 'eager'} decoding="async" />
            <button type="button" className={loved.includes(item.id) ? 'heart on' : 'heart'} aria-label="Favorite" onClick={(event) => { event.stopPropagation(); onLove(item.id) }}>
              <Icon name="heart" />
            </button>
            <span className="pro-place"><Icon name="pin" /> {item.city || 'City not set'}</span>
          </span>
          <span className="pro-main">
            <strong>{item.name}</strong>
            {item.offers.length > 0 ? <span className="pro-line">{item.offers.map((offer) => offer.name).join(' · ')}</span> : null}
            <span className="pro-price">{fromPrice(item.offers)}</span>
          </span>
        </article>
      ))}
    </div>
  )
}

export function Home({ session, onOpen }: { session: Session; onOpen: (id: string) => void }) {
  const [cards, setCards] = useState<HomeCard[]>([])
  const [loved, setLoved] = useState<string[]>(readLoved)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [sort, setSort] = useState<'name' | 'low' | 'high'>('name')
  const [savedOnly, setSavedOnly] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

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

  const portraits = useMemo(() => {
    const seen = new Set<string>()
    const unique: Portrait[] = []
    for (const item of cards) {
      if (!item.photo || seen.has(item.photo)) continue
      seen.add(item.photo)
      unique.push({ id: item.id, photo: item.photo })
    }
    return unique
  }, [cards])
  const serviceOptions = [...new Set(cards.flatMap((item) => item.offers.map((offer) => offer.name)))].sort()
  const cityOptions = [...new Set(cards.flatMap((item) => item.places.map((place) => place.name)))].sort()
  const priceValues = cards.flatMap((item) => item.offers.map((offer) => offer.price)).filter((price): price is number => price != null).map((cents) => Math.round(cents / 100))
  const priceFloor = priceValues.length ? Math.min(...priceValues) : 0
  const priceCeil = priceValues.length ? Math.max(...priceValues) : 0
  const priceCap = maxPrice == null ? priceCeil : Math.min(maxPrice, priceCeil)

  function lowest(item: HomeCard) {
    const amounts = item.offers.map((offer) => offer.price).filter((price): price is number => price != null)
    return amounts.length ? Math.min(...amounts) : Number.POSITIVE_INFINITY
  }

  const visible = cards.filter((item) => {
    const blob = `${item.name} ${item.offers.map((offer) => offer.name).join(' ')} ${item.specialties.map((specialty) => specialty.name).join(' ')} ${item.city}`.toLowerCase()
    if (query.trim() && !blob.includes(query.trim().toLowerCase())) return false
    if (cities.length > 0 && !item.places.some((place) => cities.includes(place.name))) return false
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
  const grouped = !filtersOn && visible.some((item) => item.specialties.length > 0)
  const bands = grouped ? bandsOf(visible) : []
  const openBands = grouped ? bands.slice(0, Math.max(1, Math.ceil(shown / PAGE))) : []
  const openCards = grouped ? [] : visible.slice(0, shown)
  const more = grouped ? openBands.length < bands.length : shown < visible.length
  const filterKey = `${grouped}|${query}|${services.join('\u0001')}|${cities.join('\u0001')}|${savedOnly}|${priceCap}|${sort}`

  useEffect(() => {
    setShown(PAGE)
  }, [filterKey])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !more || loading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE)
    }, { rootMargin: '480px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [more, shown, loading, filterKey])

  function serviceLabel(name: string) {
    const matches = cards.flatMap((item) => item.offers.filter((offer) => offer.name === name && offer.price != null && offer.currency))
    if (matches.length === 0) return name
    const lowestOffer = matches.reduce((best, offer) => ((offer.price ?? 0) < (best.price ?? 0) ? offer : best))
    const priced = money(lowestOffer.price ?? 0, lowestOffer.currency ?? 'USD')
    const same = matches.every((offer) => offer.price === lowestOffer.price && offer.currency === lowestOffer.currency)
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

  function toggleLove(id: string) {
    setLoved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      writeLoved(next)
      return next
    })
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
      <div className="page home-find">
        {loading ? <LoadingBlock kind="cards" text="Loading the catalog." /> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <p className="finder-empty">No therapists match these filters. <button type="button" className="link" onClick={clearFilters}>Clear filters</button></p>
        ) : null}
        {grouped ? openBands.map((band, index) => (
          <section className="home-band" key={band.id}>
            <div className="section-title">
              <h2>{band.title}</h2>
              <p className="muted">{band.items.length < band.total ? `${band.items.length} of ${band.total}` : band.total} {band.total === 1 ? 'therapist' : 'therapists'}</p>
            </div>
            <ProCards items={band.items} loved={loved} lazy={index > 0} onOpen={onOpen} onLove={toggleLove} />
          </section>
        )) : null}
        {!grouped && !loading && !error && openCards.length > 0 ? (
          <section className="home-band">
            <div className="section-title">
              <h2>Featured therapists</h2>
              <p className="muted">{visible.length} {visible.length === 1 ? 'therapist' : 'therapists'}</p>
            </div>
            <ProCards items={openCards} loved={loved} lazy={shown > PAGE} onOpen={onOpen} onLove={toggleLove} />
          </section>
        ) : null}
        {more && !loading && !error ? <div className="home-sentinel" ref={sentinel} /> : null}
      </div>
    </>
  )
}
