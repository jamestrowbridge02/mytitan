import MarketingShell from "../components/layout/MarketingShell";
import { useMemo, useState } from 'react';

const marketingPolishEnabled =
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1 || '').trim().toLowerCase() === 'on' ||
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1 || '').trim().toLowerCase() === 'true' ||
  (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1 || '').trim().toLowerCase() === '1';

export default function MarketingHome() {
  const [annual, setAnnual] = useState(false);
  const signInHref = 'https://app.mytitan.co.uk/login';
  const billingHref = 'https://app.mytitan.co.uk/dashboard/billing';
  const pricing = useMemo(
    () => ({
      sole: annual ? '£39/mo billed annually' : '£49/mo',
      business: annual ? '£95/mo billed annually' : '£119/mo',
      enterprise: annual ? 'From £239/mo billed annually' : 'From £299/mo',
    }),
    [annual],
  );

  return (
    <MarketingShell><main>
      <header className="mkt-card">
        <div className="pill">MyTitan</div>
        <h1>MyTitan — Jobs, bookings, payments, and customer comms for garages, wheels, bodyshops & mobile techs.</h1>
        <p>
          Run the full workflow from quote to completion with guided setup, templates, customer portal, and integrations.
        </p>
        <div className="actions">
          <a className="mkt-btn" href="https://app.mytitan.co.uk/login">Sign in</a>
          <a className="mkt-btn" href={signInHref}>Get started</a>
          <a className="mkt-btn" href={billingHref}>Start subscription</a>
        </div>
        {marketingPolishEnabled ? <p className="muted-line">Built for wheels, bodyshop, garage, and mobile operators.</p> : null}
      </header>

      <section className="">
        <h2>Why teams choose MyTitan</h2>
        <div className="grid four">
          <article className="mkt-card"><h3>Speed</h3><p>Fast job creation and cleaner handovers.</p></article>
          <article className="mkt-card"><h3>Guided setup</h3><p>Get live without technical setup friction.</p></article>
          <article className="mkt-card"><h3>Templates & portal</h3><p>Consistent paperwork and customer approvals.</p></article>
          <article className="mkt-card"><h3>Marketplace</h3><p>Add integrations and presets as you grow.</p></article>
        </div>
      </section>

      <section className="">
        <h2>Trades supported</h2>
        <div className="grid four">
          <article className="mkt-card"><h3>Wheels</h3><p>Repair, powder coat, straightening, and more.</p></article>
          <article className="mkt-card"><h3>Bodyshop</h3><p>Paint and repair workflows with progress tracking.</p></article>
          <article className="mkt-card"><h3>Garage</h3><p>Service and diagnostic jobs with clear status.</p></article>
          <article className="mkt-card"><h3>Mobile Tech</h3><p>Field-first flow with straightforward job capture.</p></article>
        </div>
      </section>

      <section className="">
        <h2>Pricing</h2>
        <div className="actions">
          <button className={`button ${annual ? 'ghost' : ''}`} type="button" onClick={() => setAnnual(false)}>Monthly</button>
          <button className={`button ${annual ? '' : 'ghost'}`} type="button" onClick={() => setAnnual(true)}>Annual</button>
        </div>
        <div className="grid three">
          <article className="mkt-card">
            <h3>Sole Trader</h3>
            <p>{pricing.sole}</p>
            <a className="inline-cta" href={billingHref}>Start subscription</a>
          </article>
          <article className="mkt-card">
            <h3>Business</h3>
            <p>{pricing.business}</p>
            <a className="inline-cta" href={billingHref}>Start subscription</a>
          </article>
          <article className="mkt-card">
            <h3>Enterprise</h3>
            <p>{pricing.enterprise}</p>
            <a className="inline-cta" href={billingHref}>Contact sales</a>
          </article>
        </div>
      </section>

      <section className="">
        <h2>FAQ + Trust</h2>
        <div className="grid two">
          <article className="mkt-card">
            <h3>Can I try it first?</h3>
            <p>Yes. Start with your account and explore the platform immediately.</p>
          </article>
          <article className="mkt-card">
            <h3>Is setup technical?</h3>
            <p>No. Guided setup and defaults are designed for workshop teams.</p>
          </article>
        </div>
        <div className="mkt-card trust">
          <h3>Trusted workflow</h3>
          <p>Jobs, bookings, CRM, invoices, payments and customer portal in one guided workspace.</p>
        </div>
      </section>
    </main>
</MarketingShell>
  );
}
