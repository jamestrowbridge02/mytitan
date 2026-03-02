const demoEnabled =
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO || '').trim().toLowerCase() === 'on' ||
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO || '').trim().toLowerCase() === 'true' ||
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO || '').trim().toLowerCase() === '1';

export default function MarketingHome() {
  const demoHref = demoEnabled
    ? 'https://app.mytitan.co.uk/login?=1'
    : 'https://app.mytitan.co.uk/login';

  return (
    <main className="page">
      <header className="hero section">
        <div className="pill">MyTitan</div>
        <h1>MyTitan — Jobs, bookings, payments, and customer comms for garages, wheels, bodyshops & mobile techs.</h1>
        <p>
          Run the full workflow from quote to completion with guided setup, templates, customer portal, and integrations.
        </p>
        <div className="actions">
          <a className="button" href="https://app.mytitan.co.uk/login">Sign in</a>
          <a className="button ghost" href={demoHref}>Try the </a>
        </div>
      </header>

      <section className="section">
        <h2>Why teams choose MyTitan</h2>
        <div className="grid four">
          <article className="card"><h3>Speed</h3><p>Fast job creation and cleaner handovers.</p></article>
          <article className="card"><h3>Guided setup</h3><p>Get live without technical setup friction.</p></article>
          <article className="card"><h3>Templates & portal</h3><p>Consistent paperwork and customer approvals.</p></article>
          <article className="card"><h3>Marketplace</h3><p>Add integrations and presets as you grow.</p></article>
        </div>
      </section>

      <section className="section">
        <h2>Trades supported</h2>
        <div className="grid four">
          <article className="card"><h3>Wheels</h3><p>Repair, powder coat, straightening, and more.</p></article>
          <article className="card"><h3>Bodyshop</h3><p>Paint and repair workflows with progress tracking.</p></article>
          <article className="card"><h3>Garage</h3><p>Service and diagnostic jobs with clear status.</p></article>
          <article className="card"><h3>Mobile Tech</h3><p>Field-first flow with straightforward job capture.</p></article>
        </div>
      </section>

      <section className="section">
        <h2>Pricing</h2>
        <div className="grid three">
          <article className="card"><h3>Sole Trader</h3><p>Monthly or annual. Built for owner-operators.</p></article>
          <article className="card"><h3>Business</h3><p>Monthly or annual. Team operations and reporting.</p></article>
          <article className="card"><h3>Enterprise</h3><p>Monthly or annual. Advanced controls and scaling.</p></article>
        </div>
      </section>

      <section className="section">
        <h2>FAQ + Trust</h2>
        <div className="grid two">
          <article className="card">
            <h3>Can I run a  first?</h3>
            <p>Yes. Use “Try the ” for a safe read/write  tenant.</p>
          </article>
          <article className="card">
            <h3>Is setup technical?</h3>
            <p>No. Guided setup and defaults are designed for workshop teams.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
