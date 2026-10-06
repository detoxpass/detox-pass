import { useEffect, useRef, useState } from 'react'
import { formatWhen } from '../features/booking/when'
import { loadChat, postChat, type ChatBlock, type Session } from '../lib/supabase'
import { money } from './Professional'
import { Button, Icon } from '../ui'

type Person = {
  id: string
  name: string
  photo: string
  services?: { id: string; name: string; price_cents?: number | null; currency?: string | null }[]
  cities?: { id: string; name: string }[]
  specialties?: { id: string; name: string }[]
  schedule_mode?: string | null
}

export function Chat({ session, go }: { session: Session; go: (path: string) => void }) {
  const [threadId, setThreadId] = useState('')
  const [blocks, setBlocks] = useState<ChatBlock[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const started = useRef(0)

  useEffect(() => {
    let alive = true
    loadChat(session).then((loaded) => {
      if (!alive) return
      setThreadId(loaded.threadId)
      setBlocks(loaded.messages.flatMap((message) => Array.isArray(message.blocks) ? message.blocks : []))
    }).catch((caught: unknown) => {
      if (alive) setError(caught instanceof Error ? caught.message : 'Could not open the chat.')
    })
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [blocks, busy])

  async function send(value = text, fromAudio = false) {
    const message = value.trim()
    if (!message || busy) return
    setText('')
    setError('')
    setBusy(true)
    setBlocks((current) => [...current, { type: 'user', text: message, from_audio: fromAudio }])
    try {
      const result = await postChat(session, { action: 'turn', text: message, thread_id: threadId, from_audio: fromAudio })
      const body = result.body as { thread_id?: string; blocks?: ChatBlock[]; error?: string }
      if (body.thread_id) setThreadId(body.thread_id)
      if (body.error) setError(body.error)
      if (Array.isArray(body.blocks)) setBlocks((current) => [...current, ...body.blocks!])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assistant could not answer.')
    } finally {
      setBusy(false)
    }
  }

  async function askOpenings(professionalId: string, serviceId?: string, cityId?: string) {
    setBusy(true)
    setError('')
    try {
      const result = await postChat(session, {
        action: 'openings',
        professional_id: professionalId,
        service_id: serviceId,
        city_id: cityId,
        date: localDay(),
      })
      const body = result.body as { blocks?: ChatBlock[]; error?: string }
      if (body.error) setError(body.error)
      if (Array.isArray(body.blocks)) setBlocks((current) => [...current, ...body.blocks!])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load times.')
    } finally {
      setBusy(false)
    }
  }

  async function book(token: string) {
    setBusy(true)
    setError('')
    try {
      const result = await postChat(session, { action: 'book', opening_token: token, thread_id: threadId })
      const body = result.body as { blocks?: ChatBlock[]; error?: string }
      if (body.error) setError(body.error)
      if (Array.isArray(body.blocks)) setBlocks((current) => [...current, ...body.blocks!])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The reservation was not created.')
    } finally {
      setBusy(false)
    }
  }

  function startRecording() {
    if (busy || recording) return
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const media = new MediaRecorder(stream, { mimeType: mime })
      const chunks: Blob[] = []
      media.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const duration = (Date.now() - started.current) / 1000
        const blob = new Blob(chunks, { type: mime })
        void blob.arrayBuffer().then((buffer) => transcribe(new Uint8Array(buffer), mime, duration))
      }
      recorder.current = media
      started.current = Date.now()
      media.start()
      setRecording(true)
      window.setTimeout(() => { if (media.state === 'recording') media.stop() }, 60_000)
    }).catch(() => setError('The microphone is not available.'))
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    setRecording(false)
  }

  async function transcribe(bytes: Uint8Array, mime: string, duration: number) {
    setBusy(true)
    setError('')
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    try {
      const result = await postChat(session, { action: 'transcribe', audio_base64: btoa(binary), mime, duration_seconds: duration })
      const body = result.body as { text?: string; error?: string; blocks?: ChatBlock[] }
      if (body.text) setText(body.text)
      else if (Array.isArray(body.blocks)) setBlocks((current) => [...current, ...body.blocks!])
      else setError(body.error || 'The recording could not be transcribed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The recording could not be transcribed.')
    } finally {
      setRecording(false)
      setBusy(false)
    }
  }

  return (
    <div className="page chat">
      <div className="chat-log" ref={scroller}>
        {blocks.length === 0 ? (
          <section className="fav-empty">
            <span className="heart-lg" aria-hidden="true"><Icon name="chat" /></span>
            <h2>Ask for a therapist</h2>
            <p>Name a service or a city. Times come from the calendar, and a booking happens when you tap one.</p>
          </section>
        ) : null}
        {blocks.map((block, index) => (
          <BlockView key={`${block.type}-${index}`} block={block} go={go} busy={busy} onOpenings={askOpenings} onBook={book} />
        ))}
        {busy ? <p className="muted">Looking that up.</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <form className="chat-dock" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <button type="button" className={recording ? 'mic on' : 'mic'} aria-label={recording ? 'Stop recording' : 'Record audio'} onClick={recording ? stopRecording : startRecording}>
          <Icon name="mic" />
        </button>
        <input value={text} placeholder="Service, city, or therapist" aria-label="Message" onChange={(event) => setText(event.target.value)} />
        <Button kind="primary" type="submit" disabled={busy || !text.trim()}>Send</Button>
      </form>
    </div>
  )
}

function BlockView({ block, go, busy, onOpenings, onBook }: {
  block: ChatBlock
  go: (path: string) => void
  busy: boolean
  onOpenings: (professionalId: string, serviceId?: string, cityId?: string) => void
  onBook: (token: string) => void
}) {
  if (block.type === 'user') {
    return <p className="bubble user">{block.from_audio ? <Icon name="mic" /> : null}{String(block.text ?? '')}</p>
  }
  if (block.type === 'text') return <p className="bubble">{String(block.text ?? '')}</p>
  if (block.type === 'professional_cards') {
    const people = Array.isArray(block.people) ? block.people as Person[] : []
    const relaxed = Array.isArray(block.relaxed) ? block.relaxed.map(String) : []
    return (
      <section className="chat-cards">
        {relaxed.length > 0 ? <p className="muted">{relaxedLabel(relaxed)}</p> : null}
        <div className="cards">
          {people.map((person) => (
            <article key={person.id} className="tcard" onClick={() => go(`/therapists/${person.id}`)}>
              <img src={person.photo || '/people/splash.jpg'} alt="" />
              <div className="tmeta">
                <strong>{person.name}</strong>
                <span>{priceOf(person)}</span>
              </div>
              <div className="tags">{(person.services ?? []).map((service) => <em key={service.id}>{service.name}</em>)}</div>
              <small><Icon name="pin" /> {(person.cities ?? []).map((city) => city.name).join(', ') || 'City not set'}</small>
              <button type="button" className="btn soft" disabled={busy} onClick={(event) => { event.stopPropagation(); onOpenings(person.id) }}>See times</button>
            </article>
          ))}
        </div>
      </section>
    )
  }
  if (block.type === 'professional_detail') {
    const person = block.professional as Person | undefined
    if (!person?.id) return <p className="bubble">That professional is not available.</p>
    return (
      <article className="chat-detail">
        <img src={person.photo || '/people/splash.jpg'} alt="" />
        <div>
          <h2>{person.name}</h2>
          <p>{(person.services ?? []).map((service) => service.name).join(', ') || 'No service listed'}</p>
          <p className="muted">{(person.cities ?? []).map((city) => city.name).join(', ')}</p>
          <div className="chat-actions">
            <Button kind="soft" disabled={busy} onClick={() => onOpenings(person.id)}>See times</Button>
            <Button kind="ghost" onClick={() => go(`/therapists/${person.id}`)}>Open profile</Button>
          </div>
        </div>
      </article>
    )
  }
  if (block.type === 'choice') {
    const services = Array.isArray(block.services) ? block.services as { id: string; name: string }[] : []
    const cities = Array.isArray(block.cities) ? block.cities as { id: string; name: string }[] : []
    const professionalId = String(block.professional_id ?? '')
    return (
      <section className="chat-choice">
        <p>Choose a service and a city.</p>
        <div className="inbox-filters">
          {services.flatMap((service) => cities.map((city) => (
            <button key={`${service.id}-${city.id}`} type="button" className="chip" disabled={busy} onClick={() => onOpenings(professionalId, service.id, city.id)}>{service.name} · {city.name}</button>
          )))}
        </div>
      </section>
    )
  }
  if (block.type === 'openings') {
    const times = Array.isArray(block.times) ? block.times as { starts_at: string; opening_token: string }[] : []
    return (
      <section className="chat-times">
        <h2>{String(block.service ?? 'Session')} in {String(block.city ?? 'the listed city')}</h2>
        {times.length === 0 ? <p>That day has no open time.</p> : (
          <div className="inbox-filters">
            {times.map((time) => (
              time.opening_token
                ? <button key={time.opening_token} type="button" className="chip" disabled={busy} onClick={() => onBook(time.opening_token)}>{formatWhen(time.starts_at)}</button>
                : <span key={time.starts_at} className="chip">{formatWhen(time.starts_at)}</span>
            ))}
          </div>
        )}
      </section>
    )
  }
  if (block.type === 'booking_receipt') {
    return (
      <article className="chat-receipt">
        <p className="eyebrow">Reserved</p>
        <h2>{String(block.service ?? 'Session')}</h2>
        <p>{String(block.professional ?? '')} · {String(block.city ?? '')}</p>
        <p>{block.starts_at ? formatWhen(String(block.starts_at)) : ''}</p>
        <Button onClick={() => go(`/sessions/${String(block.booking_id ?? '')}`)}>Open session</Button>
      </article>
    )
  }
  if (block.type === 'account') {
    const bookings = Array.isArray(block.bookings) ? block.bookings as { id: string; starts_at: string; status: string; service: string; city: string; professional: string }[] : []
    return (
      <article className="chat-detail">
        <div>
          <h2>{String(block.name || 'Your account')}</h2>
          <p className="muted">{String(block.email ?? '')}</p>
          {bookings.length === 0 ? <p>No upcoming reservations.</p> : bookings.map((item) => (
            <button key={item.id} type="button" className="dash-item" onClick={() => go(`/sessions/${item.id}`)}>
              <b>{item.service}</b>
              <small>{item.professional} · {item.city}</small>
              <time>{formatWhen(item.starts_at)}</time>
            </button>
          ))}
        </div>
      </article>
    )
  }
  if (block.type === 'empty') {
    const relaxed = Array.isArray(block.relaxed) ? block.relaxed.map(String) : []
    return <p className="bubble">{relaxed.length ? relaxedLabel(relaxed) : 'No therapist matches that search.'}</p>
  }
  if (block.type === 'pending' || block.type === 'limit' || block.type === 'error') {
    return <p className={block.type === 'error' ? 'bubble error' : 'bubble'}>{String(block.text ?? 'This reply could not be shown.')}</p>
  }
  return <p className="bubble error">This reply could not be shown.</p>
}

function priceOf(person: Person) {
  const priced = (person.services ?? []).filter((service) => service.price_cents != null && service.currency)
  if (priced.length === 0) return 'Price pending'
  const lowest = priced.reduce((best, service) => (service.price_cents ?? 0) < (best.price_cents ?? 0) ? service : best)
  const label = money(lowest.price_cents ?? 0, lowest.currency ?? 'USD')
  return priced.length > 1 ? `From ${label}` : label
}

function relaxedLabel(relaxed: string[]) {
  if (relaxed.includes('specialties') && !relaxed.includes('cities')) return 'Nobody with that specialty. These therapists still match the service and city.'
  if (relaxed.includes('cities')) return 'Nobody in that city for the specialty. These therapists still offer the service.'
  if (relaxed.includes('query')) return 'That wording is not a name in the catalog. These therapists still offer the service.'
  return 'No therapist matches that search.'
}

function localDay() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
