import { sessions, therapists } from '../data'
import { Button, PageHead, Status } from '../ui'

export function AdminScreens({ screen, ask }: { screen: string; ask: (title: string, text: string) => void }) {
  if (screen === 'booking') {
    return (
      <div className="page">
        <PageHead title="Booking management" text="Monitor and manage all therapy session bookings." />
        <div className="tabs"><b>All sessions</b><span>Completed</span><span>Confirmed</span><span>Pending</span><span>Canceled</span></div>
        <div className="stats four">
          <article><small>Total bookings</small><strong>3678</strong></article>
          <article><small>Completed</small><strong>2344</strong></article>
          <article><small>Pending</small><strong>1123</strong></article>
          <article><small>Canceled</small><strong>546</strong></article>
        </div>
        <section className="panel">
          <header className="table-head"><h2>Bookings</h2><input placeholder="Search by booking code, client, therapist or service" /></header>
          <table>
            <thead>
              <tr><th>Booking code</th><th>Client</th><th>Therapist</th><th>Service</th><th>Status</th><th>Location</th><th>Price</th></tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.code}>
                  <td>{item.code}</td><td>{item.client}</td><td>{item.therapist}</td><td>{item.service}</td>
                  <td><Status value={item.status} /></td><td>{item.place}</td><td>$ {item.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  if (screen === 'dashboard') {
    return (
      <div className="page">
        <PageHead title="Dashboard" text="Operation view. Paid, pending and released stay in the finance screen." />
        <div className="stats">
          <article><small>Bookings today</small><strong>18</strong></article>
          <article><small>Waiting confirmation</small><strong>6</strong></article>
          <article><small>Payouts to authorize</small><strong>3</strong></article>
        </div>
      </div>
    )
  }

  if (screen === 'therapists') {
    return (
      <div className="page">
        <PageHead title="Therapists" text="Gerenciamento de terapeutas. Approval does not connect a calendar by itself." />
        <div className="stack">
          {therapists.map((item) => (
            <article key={item.id} className="session">
              <img src={item.photo} alt="" />
              <div><strong>{item.name}</strong><p>{item.tags.join(' · ')} · $ {item.price}</p></div>
              <Button kind="ghost" onClick={() => ask('Approve therapist?', 'The profile becomes visible after approval.')}>Review</Button>
            </article>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'users') {
    return (
      <div className="page">
        <PageHead title="Lily-Rose Chedjou" text="Client · Referral code: BBF01234" />
        <div className="right">
          <Button kind="soft" onClick={() => ask('Block user?', 'The client loses access until the operation reopens it.')}>Block user</Button>
          <Button onClick={() => ask('Delete user?', 'This removes the client account.')}>Delete user</Button>
        </div>
        <section className="reward-banner">
          <div>
            <h2>Next level: Gold</h2>
            <div className="bar"><i style={{ width: '45%' }} /></div>
            <small>550 points for reaching the next level</small>
            <button type="button" className="btn ghost" onClick={() => ask('Send points?', 'Points are added to this client.')}>Send points</button>
          </div>
          <aside><span>Your points</span><strong>450</strong><em>Silver</em></aside>
        </section>
        <h2>Personal information</h2>
        <div className="form-grid">
          <label className="field"><span>Full name</span><input defaultValue="Lily-Rose Chedjou" /></label>
          <label className="field"><span>Date of birth</span><input defaultValue="06/14/1993" /></label>
          <label className="field"><span>Gender (optional)</span><select defaultValue="Female"><option>Female</option></select></label>
          <label className="field"><span>Email</span><input defaultValue="user@gmail.com" /></label>
        </div>
        <section className="panel">
          <h2>Session history</h2>
          <table>
            <thead><tr><th>Booking code</th><th>Client</th><th>Therapist</th><th>Service</th><th>Status</th><th>Location</th><th>Price</th></tr></thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.code}><td>{item.code}</td><td>{item.client}</td><td>{item.therapist}</td><td>{item.service}</td><td><Status value={item.status} /></td><td>{item.place}</td><td>$ {item.price}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  if (screen === 'financial') {
    return (
      <div className="page">
        <PageHead title="Financial" text="Paid, pending and released. Authorize is the operation action." />
        <div className="stats">
          <article><small>Paid</small><strong>$ 12.000</strong></article>
          <article><small>Pending</small><strong>$ 2.340</strong></article>
          <article><small>Released</small><strong>$ 8.100</strong></article>
        </div>
        <div className="right">
          <Button onClick={() => ask('Authorize payout?', 'Only after the client confirms attendance.')}>Authorize payout</Button>
          <Button kind="ghost" onClick={() => ask('Export PDF', 'Current month, or choose a date range.')}>Export</Button>
        </div>
      </div>
    )
  }

  if (screen === 'gamification') {
    return (
      <div className="page">
        <PageHead title="Gamification" text="Point rules and benefits. A reward is granted only on a confirmed session." />
        <section className="panel">
          <h2>Point rules</h2>
          <p>Confirmed session · Silver 1000 · Gold 2000 · Platinum 4000 · Diamond 8000</p>
          <Button kind="ghost" onClick={() => ask('Save point rules?', 'The rule stays on the confirmed session.')}>Edit rules</Button>
        </section>
      </div>
    )
  }

  if (screen === 'reviews') {
    return (
      <div className="page">
        <PageHead title="Reviews" text="The header includes Reviews. The exported folder does not have a full page, so this keeps the same shell." />
        <article className="note-card"><strong>Adelaide</strong><p>Well done service. 4.8</p></article>
      </div>
    )
  }

  if (screen === 'docs') {
    return (
      <div className="page">
        <PageHead title="Document review" text="Análise de documentos." />
        <article className="session"><div><strong>Sara Anderson</strong><p>License pending</p></div><Button onClick={() => ask('Document approved', 'The therapist can stay visible.')}>Approve</Button></article>
      </div>
    )
  }

  if (screen === 'settings') {
    return (
      <div className="page">
        <PageHead title="Settings" text="Commission stays in marketplace settings. The screen edits the rule, it does not hardcode 20%." />
        <section className="panel">
          <label className="field"><span>Commission (bps)</span><input defaultValue="2000" /></label>
          <Button onClick={() => ask('Settings saved', 'The commission pair is stored for the marketplace.')}>Save</Button>
        </section>
      </div>
    )
  }

  if (screen === 'profile') {
    return <div className="page"><PageHead title="Profile" /><section className="panel"><h2>BBF</h2><p>Operation account.</p></section></div>
  }

  if (screen === 'notifications') {
    return <div className="page narrow"><PageHead title="Notifications" /><article className="note-card"><strong>Therapist waiting review</strong><p>Sara Anderson</p></article></div>
  }

  return (
    <div className="page narrow">
      <PageHead title="Support" />
      <Button onClick={() => ask('Reply sent', 'The ticket is updated.')}>Reply</Button>
    </div>
  )
}
