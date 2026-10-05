import { sessions } from '../data'
import { Button, PageHead, Status } from '../ui'

export function TherapistScreens({ screen, go, ask }: { screen: string; go: (id: string) => void; ask: (title: string, text: string) => void }) {
  if (screen === 'dashboard') {
    return (
      <div className="page">
        <section className="welcome">
          <img src="/people/sparkle.jpg" alt="" />
          <div>
            <h1>Welcome back, <span>Sara Anderson</span></h1>
            <p>Check out your metrics in the cards below.</p>
          </div>
          <aside>
            <small>Total points</small>
            <strong>1.250</strong>
            <button type="button" className="link" onClick={() => go('rewards')}>View rewards</button>
          </aside>
        </section>
        <div className="tabs"><b>Monthly</b><span>Yearly</span><span>Last 3 months</span><span>Last 6 months</span></div>
        <div className="stats">
          <article><small>Next sessions</small><strong>4</strong></article>
          <article><small>Month earnings</small><strong>$ 2.345,00</strong></article>
          <article><small>Rating</small><strong>4.9</strong><em>Based on 45 rates</em></article>
        </div>
        <section className="panel">
          <h2>Next sessions</h2>
          <div className="two">
            {sessions.slice(0, 2).map((item) => (
              <article key={item.code} className="session">
                <div>
                  <strong>{item.client}</strong>
                  <p>$ {item.price} <Status value={item.status} /></p>
                  <p>{item.where}</p>
                  <p>{item.when}</p>
                </div>
                <button type="button" className="btn ghost" onClick={() => go('agenda')}>View details</button>
              </article>
            ))}
          </div>
          <div className="right"><button type="button" className="btn ghost" onClick={() => go('agenda')}>View your agenda</button></div>
        </section>
      </div>
    )
  }

  if (screen === 'agenda') {
    return (
      <div className="page">
        <PageHead title="Agenda" text="Times come from the connected calendar. This screen does not create a local slot." />
        <div className="stack">
          {sessions.map((item) => (
            <article key={item.code} className="session">
              <div>
                <strong>{item.when}</strong>
                <p>{item.client} · {item.service}</p>
                <Status value={item.status} />
              </div>
              <button type="button" className="btn ghost" onClick={() => ask('Are you sure you want to reschedule?', "This action couldn't be reversed.")}>Reschedule</button>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'payments') {
    return (
      <div className="page">
        <PageHead title="Payments" text="Statement for the therapist. Export is available. Releasing a payout stays with the operation." />
        <div className="stats">
          <article><small>Paid</small><strong>$ 1.840,00</strong></article>
          <article><small>Pending</small><strong>$ 505,00</strong></article>
          <article><small>Released</small><strong>$ 0,00</strong></article>
        </div>
        <div className="right">
          <Button kind="soft" onClick={() => ask('Export PDF', 'Current month, or choose a date range.')}>Export PDF</Button>
          <Button kind="ghost" onClick={() => ask('Export Excel', 'Current month, or choose a date range.')}>Export Excel</Button>
        </div>
      </div>
    )
  }

  if (screen === 'rewards') {
    return (
      <div className="page">
        <PageHead title="Rewards" text="Points appear after a confirmed session." />
        <section className="welcome">
          <div><h1>1.250 points</h1><p>Silver in progress.</p></div>
        </section>
      </div>
    )
  }

  if (screen === 'profile') {
    return (
      <div className="page">
        <section className="panel">
          <header className="who-row">
            <img src="/people/sparkle.jpg" alt="" />
            <div className="who-id"><strong>Sara Anderson</strong><small>Therapist</small></div>
            <div className="who-actions">
              <button type="button" className="link" onClick={() => ask('Delete account?', 'This removes the therapist profile.')}>Delete account</button>
              <button type="button" className="btn ghost">Edit information</button>
              <button type="button" className="btn ghost">View profile</button>
            </div>
          </header>
          <h2>Personal information</h2>
          <div className="form-grid">
            <label className="field"><span>Full name</span><input defaultValue="Sara Anderson" /></label>
            <label className="field"><span>Date of birth</span><input defaultValue="06/14/1993" /></label>
            <label className="field"><span>Gender (optional)</span><select defaultValue="Female"><option>Female</option><option>Male</option></select></label>
            <label className="field"><span>Email</span><input defaultValue="saraanderson@gmail.com" /></label>
            <label className="field"><span>Password</span><input type="password" defaultValue="secret12" /></label>
            <label className="field"><span>Confirm password</span><input type="password" defaultValue="secret12" /></label>
          </div>
          <label className="field"><span>Bio</span><textarea defaultValue="Tell about you..." /></label>
          <h2>Hourly rate</h2>
          <p>Main services</p>
          <div className="tags"><em>$ 120</em><em>Hot stone</em><em>$ 100</em><em>Deep tissue</em></div>
          <p>Add-on</p>
          <div className="tags"><em>$ 120</em><em>Hot stone</em><em>$ 100</em><em>Deep tissue</em></div>
          <h2>Contact and address</h2>
          <div className="form-grid">
            <label className="field"><span>Base address</span><input placeholder="Enter your base address" /></label>
            <label className="field"><span>ZIP Code</span><input placeholder="Enter ZIP" /></label>
            <label className="field"><span>City</span><input placeholder="Enter city" /></label>
            <label className="field"><span>State</span><input placeholder="Enter state" /></label>
            <label className="field"><span>Phone number</span><input defaultValue="US +1" /></label>
            <label className="field"><span>Instagram username</span><input defaultValue="saraanderson" /></label>
          </div>
          <h2>Specializations and coverage area</h2>
          <div className="form-grid">
            <label className="field"><span>Main services</span><input defaultValue="Brazilian FACE Lymphatic" /></label>
            <label className="field"><span>Add-on</span><input defaultValue="Brazilian Radio frequency" /></label>
            <label className="field"><span>Coverage area</span><input placeholder="Enter city name or radius" /></label>
          </div>
          <h2>Certificates</h2>
          <p className="muted">Tech design requirements.pdf</p>
          <button type="button" className="btn ghost" onClick={() => ask('Send to analysis?', 'The document goes to the operation review.')}>Send to analysis</button>
          <h2>Portfolio</h2>
          <div className="cards mini">
            <img src="/people/sparkle.jpg" alt="" />
            <img src="/people/nathana.jpg" alt="" />
            <img src="/people/naomi.jpg" alt="" />
          </div>
          <div className="right"><button type="button" className="btn ghost">Save changes</button></div>
        </section>
      </div>
    )
  }

  if (screen === 'notifications') {
    return <div className="page narrow"><PageHead title="Notifications" /><article className="note-card"><strong>New booking</strong><p>Johanna Clark · pending</p></article></div>
  }

  return (
    <div className="page narrow center-page">
      <h1>Support</h1>
      <p className="muted">Same help pattern as the client folder.</p>
      <Button onClick={() => ask('Message sent', 'Support received your note.')}>Get in touch</Button>
    </div>
  )
}
