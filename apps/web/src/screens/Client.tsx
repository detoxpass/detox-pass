import { useState } from 'react'
import { sessions, therapists } from '../data'
import { Button, Field, Icon, PageHead, Status } from '../ui'

export function ClientScreens({
  screen,
  go,
  ask,
}: {
  screen: string
  go: (id: string) => void
  ask: (title: string, text: string, action?: () => void, confirm?: string) => void
}) {
  const dates = ['August 28th, 2025', 'August 29th, 2025', 'September 2nd, 2025']
  const times = ['9:00 AM', '10:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '4:00 PM']
  const [loved, setLoved] = useState<string[]>(['sarah'])
  const [query, setQuery] = useState('Hot stone')
  const [person, setPerson] = useState(therapists[0].id)
  const [from, setFrom] = useState('find')
  const [service, setService] = useState(therapists[0].tags[0])
  const [day, setDay] = useState(dates[0])
  const [slot, setSlot] = useState(times[0])
  const [bookings, setBookings] = useState(sessions)
  const [editing, setEditing] = useState<string | null>(null)
  const [faq, setFaq] = useState(0)
  const [draft, setDraft] = useState({ service: 'All', gender: 'All', miles: 25, price: 200 })
  const [filters, setFilters] = useState(draft)
  const selected = therapists.find((item) => item.id === person) ?? therapists[0]
  const favorites = therapists.filter((item) => loved.includes(item.id))

  function openTherapist(id: string) {
    const next = therapists.find((item) => item.id === id) ?? therapists[0]
    setPerson(next.id)
    setService(next.tags[0])
    setSlot(times[0])
    setFrom(screen)
    go('therapist')
  }

  function matches(item: (typeof therapists)[number]) {
    const q = query.trim().toLowerCase()
    const blob = `${item.name} ${item.tags.join(' ')} ${item.service}`.toLowerCase()
    if (screen === 'search' && q && !blob.includes(q)) return false
    if (filters.service !== 'All' && item.service !== filters.service) return false
    if (filters.gender !== 'All' && item.gender !== filters.gender) return false
    if (item.miles > filters.miles) return false
    if (item.price > filters.price) return false
    return true
  }

  if (screen === 'find' || screen === 'search' || screen === 'favorites') {
    const list = (screen === 'favorites' ? favorites : therapists).filter(matches)
    return (
      <>
        {screen === 'find' ? (
          <section className="hero">
            <div className="referral">Your referral code: BBF01234</div>
            <span className="hero-search"><Icon name="search" /></span>
            <h1>Find your perfect therapist</h1>
            <p>Experience professional massage therapy tailored to your needs, delivered by certified experts in your area.</p>
            <form className="hero-bar" onSubmit={(event) => { event.preventDefault(); go('search') }}>
              <Icon name="search" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, location or service" />
              <Button type="submit"><Icon name="search" /> Search</Button>
            </form>
            <label className="check light"><input type="checkbox" defaultChecked /> I accept the terms and conditions.</label>
          </section>
        ) : null}
        <div className="page">
        {screen === 'find' ? null : (
          <PageHead title={screen === 'favorites' ? 'Favorites' : `Search results for: ${query}`} onBack={() => go('find')} back="Back to dashboard" />
        )}
        <Filters draft={draft} onChange={setDraft} onApply={() => setFilters(draft)} />
        <div className="section-title">
          <h2>{screen === 'find' ? 'Featured diamond therapists' : screen === 'favorites' ? 'Saved therapists' : 'Results'}</h2>
        </div>
        {list.length === 0 ? <p className="muted">No therapists match this search.</p> : null}
        <div className="cards">
          {list.map((item) => (
            <article key={item.id} className="tcard" onClick={() => openTherapist(item.id)}>
              <img src={item.photo} alt="" />
              <button type="button" className={loved.includes(item.id) ? 'heart on' : 'heart'} aria-label="Favorite" onClick={(event) => { event.stopPropagation(); setLoved((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) }}>
                <Icon name="heart" />
              </button>
              <div className="tmeta">
                <strong>{item.name}</strong>
                <span>$ {item.price} <Icon name="star" /> {item.rating}</span>
              </div>
              <div className="tags">{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
              <small><Icon name="pin" /> {item.miles} miles away</small>
            </article>
          ))}
        </div>
        </div>
      </>
    )
  }

  if (screen === 'therapist') {
    return (
      <div className="page">
        <PageHead title="" onBack={() => go(from)} back={from === 'favorites' ? 'Back to favorites' : from === 'search' ? 'Back to results' : 'Back to dashboard'} />
        <div className="profile-grid">
          <img className="portrait" src={selected.photo} alt="" />
          <div>
            <p className="kicker">Referral code: BBF01234</p>
            <h1>{selected.name}</h1>
            <p><Icon name="pin" /> {selected.miles} miles away</p>
            <p><Icon name="star" /> {selected.rating} · 20 reviews</p>
            <p className="price">$ {selected.price}</p>
            <h3>Main services</h3>
            <div className="tags">
              {selected.tags.map((tag) => (
                <button key={tag} type="button" className={service === tag ? 'on' : ''} onClick={() => setService(tag)}>{tag}</button>
              ))}
            </div>
            <h3>Date</h3>
            <div className="slots">
              {dates.map((item) => (
                <button key={item} type="button" className={day === item ? 'on' : ''} onClick={() => setDay(item)}>{item.replace(', 2025', '')}</button>
              ))}
            </div>
            <h3>Time</h3>
            <div className="slots">
              {times.map((item) => (
                <button key={item} type="button" className={slot === item ? 'on' : ''} onClick={() => setSlot(item)}>{item}</button>
              ))}
            </div>
            <p className="muted">{service} · {day} · {slot}</p>
            <Button onClick={() => ask(
              'Confirm this booking?',
              `${selected.name}, ${service}, ${day} at ${slot}. The price is $ ${selected.price}. It stays pending until the calendar and the payment confirm it.`,
              () => {
                setBookings((current) => [{
                  code: `BBF-2025-${String(current.length + 8).padStart(3, '0')}`,
                  client: 'Hebert Richards',
                  therapist: selected.name,
                  service,
                  status: 'Pending',
                  where: selected.service === 'Mobile' ? 'Mobile' : 'At business',
                  when: `${day} - ${slot}`,
                  price: selected.price,
                  place: 'Boston',
                }, ...current])
                go('sessions')
              },
              'Confirm booking',
            )}>Confirm booking</Button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'sessions') {
    return (
      <div className="page">
        <PageHead title="My sessions" text="Reschedule and cancel open the warning from the prototype. They do not release a payout." />
        <div className="stack">
          {bookings.map((item) => (
            <article key={item.code} className="session">
              <div>
                <strong>{item.therapist}</strong>
                <p>{item.service} · {item.when}</p>
                <Status value={item.status} />
                {editing === item.code ? (
                  <div className="slots">
                    {times.map((time) => (
                      <button key={time} type="button" className={item.when.endsWith(time) ? 'on' : ''} onClick={() => {
                        setBookings((current) => current.map((row) => row.code === item.code ? { ...row, when: `${row.when.split(' - ')[0]} - ${time}`, status: 'Pending' } : row))
                        setEditing(null)
                      }}>{time}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="session-actions">
                <b>$ {item.price}</b>
                {item.status === 'Canceled' ? null : (
                  <>
                    <button type="button" className="btn ghost" onClick={() => ask('Are you sure you want to reschedule?', "This action couldn't be reversed.", () => setEditing(item.code))}>Reschedule</button>
                    <button type="button" className="btn ghost" onClick={() => ask('Cancel this session?', 'The booking returns to the compensation path. The amount is not invented here.', () => setBookings((current) => current.map((row) => row.code === item.code ? { ...row, status: 'Canceled' } : row)))}>Cancel</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'rewards') return <Rewards />

  if (screen === 'notifications') {
    return (
      <div className="page">
        <section className="notice-banner">
          <span>Turn on the notifications to stay up to date with all updates on the platform.</span>
          <button type="button" className="btn ghost">Close</button>
          <Button>Turn on notifications</Button>
        </section>
        <h1>Notifications</h1>
        <article className="note-card">
          <strong>Session scheduled with Sarah Anderson</strong>
          <p>Your session with Sarah Anderson is scheduled for August 28, 2025, at 2:00 PM, at 123 Beacon Street, Boston, MA. Please remember to arrive on time!</p>
        </article>
        <article className="note-card">
          <strong>Session completed! +50 points added</strong>
          <p>Congratulations! You have completed your session with Sarah Anderson on August 28, 2025. You received +50 points for attending. <button type="button" className="link">Write a review</button></p>
        </article>
        <article className="note-card">
          <strong>Session canceled</strong>
          <p>Your session with Sarah Anderson, scheduled for August 28, 2025, has been canceled. If you need to reschedule, please use the rescheduling option on the sessions screen.</p>
        </article>
      </div>
    )
  }

  if (screen === 'profile') return <Profile />

  return (
    <div className="page narrow center-page">
      <h1>Frequently asked questions</h1>
      <p className="muted">Find below quick answers to the main questions about the features and functionalities of the platform.</p>
      {['How to book a session?', 'Can I reschedule?', 'What is your cancellation policy?', 'How can I earn points?'].map((item, index) => (
        <button key={item} type="button" className={faq === index ? 'faq on' : 'faq'} onClick={() => setFaq(index)}>
          <span>{item}</span>
          <Icon name={faq === index ? 'close' : 'plus'} />
          {faq === index ? <small>Choose a therapist, a real time from the calendar, and pay through checkout.</small> : null}
        </button>
      ))}
      <section className="help">
        <h2>Still need help?</h2>
        <p>Get in touch, it will be a pleasure talking to you.</p>
        <Button onClick={() => ask('Message sent', 'Support received your note.')}>Get in touch</Button>
      </section>
    </div>
  )
}

function Filters({ draft, onChange, onApply }: { draft: { service: string; gender: string; miles: number; price: number }; onChange: (next: { service: string; gender: string; miles: number; price: number }) => void; onApply: () => void }) {
  return (
    <div className="filters">
      <Field label="Service type">
        <select value={draft.service} onChange={(event) => onChange({ ...draft, service: event.target.value })}>
          <option>All</option><option>Therapy</option><option>Mobile</option>
        </select>
      </Field>
      <Field label="Gender">
        <select value={draft.gender} onChange={(event) => onChange({ ...draft, gender: event.target.value })}>
          <option>All</option><option>Female</option><option>Male</option>
        </select>
      </Field>
      <Field label={`Location radius · ${draft.miles} mi`}>
        <input type="range" min={1} max={25} value={draft.miles} onChange={(event) => onChange({ ...draft, miles: Number(event.target.value) })} />
      </Field>
      <Field label={`Price range · up to $ ${draft.price}`}>
        <input type="range" min={50} max={200} step={10} value={draft.price} onChange={(event) => onChange({ ...draft, price: Number(event.target.value) })} />
      </Field>
      <Button kind="soft" onClick={onApply}>Apply filters</Button>
    </div>
  )
}

function Rewards() {
  const [history, setHistory] = useState(false)
  const prizes = ['Free wellness guide', '10% discount on products', '10% discount on products', 'Priority scheduling', 'Free Brazilian Face and Body for your birthday', 'Bring a friend for a free Brazilian face and body per year', '5% discount on future sessions']
  if (history) {
    return (
      <div className="page">
        <PageHead title="Redeem history" onBack={() => setHistory(false)} />
        <section className="panel">
          {prizes.map((prize, index) => (
            <div className="prize" key={`${prize}-${index}`}>
              <span>{prize}</span>
              <Status value={index === 0 ? 'Pending' : 'Completed'} />
            </div>
          ))}
        </section>
      </div>
    )
  }
  const levels = [
    { name: 'Silver', points: '1000 points', have: '450 points', benefits: ['Free wellness guide.', '5% discount on future services.'] },
    { name: 'Gold', points: '2000 points', have: 'Locked', benefits: ['All benefits from silver.', 'Swag Detox Bag'] },
    { name: 'Platinum', points: '4000 points', have: 'Locked', benefits: ['10% discount on products.', 'Priority scheduling.'] },
    { name: 'Diamond', points: '8000 points', have: 'Locked', benefits: ['15% discount on all future services.', 'Detox Lovers Box subscription.'] },
  ]
  return (
    <div className="page">
      <PageHead title="Rewards" text="Earn points and unlock exclusive benefits." />
      <div className="right"><button type="button" className="btn ghost" onClick={() => setHistory(true)}>Redeem history</button></div>
      <section className="reward-banner">
        <div>
          <h2>Next level: Gold</h2>
          <div className="bar"><i style={{ width: '45%' }} /></div>
          <small>550 points for reaching the next level</small>
        </div>
        <aside>
          <span>Your points</span>
          <strong>450</strong>
          <em>Silver</em>
        </aside>
      </section>
      <div className="level-grid">
        {levels.map((level) => (
          <article key={level.name}>
            <header><b>{level.name}</b><span>{level.points}</span></header>
            <small>{level.have}</small>
            <ul>{level.benefits.map((item) => <li key={item}>{item}</li>)}</ul>
            <button type="button" className="btn ghost">Redeem</button>
          </article>
        ))}
      </div>
    </div>
  )
}

function Profile() {
  return (
    <div className="page">
      <section className="panel">
        <header className="who-row">
          <img src="/people/arena.jpg" alt="" />
          <div className="who-id">
            <strong>Hebert Richards</strong>
            <small>Referral code: BBF01234</small>
          </div>
          <div className="who-actions">
            <button type="button" className="link">Delete account</button>
            <button type="button" className="btn ghost">Edit information</button>
          </div>
        </header>
        <h2>Personal information</h2>
        <p className="muted">Information about you.</p>
        <div className="form-grid">
          <Field label="Full name"><input defaultValue="Hebert Richards" /></Field>
          <Field label="Date of birth"><input defaultValue="06/14/1993" /></Field>
          <Field label="Gender (optional)"><select defaultValue="Male"><option>Male</option><option>Female</option></select></Field>
          <Field label="Email"><input defaultValue="hebertrichards@gmail.com" /></Field>
          <Field label="Password"><input type="password" defaultValue="secret12" /></Field>
          <Field label="Confirm password"><input type="password" defaultValue="secret12" /></Field>
          <Field label="Phone number"><input defaultValue="US +1" /></Field>
        </div>
        <div className="right"><Button kind="ghost">Save changes</Button></div>
      </section>
    </div>
  )
}
