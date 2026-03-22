import Link from "next/link";

import MarketingSeo from "../components/MarketingSeo";
import MarketingShell from "../components/layout/MarketingShell";
import {
  MarketingCtaBand,
  MarketingPageHero,
  MarketingSectionHeading,
} from "../components/marketing/Sections";
import { solutionGroups } from "../lib/site-content";

export default function SolutionsPage() {
  return (
    <MarketingShell>
      <MarketingSeo
        title="Solutions"
        description="See how MyTitan helps owners, service managers, and admin teams run the business from one shared system."
        path="/solutions"
      />

      <MarketingPageHero
        eyebrow="Solutions"
        title="See who gets value from MyTitan first."
        lead="This page is for teams deciding whether MyTitan solves the day-to-day problems they are dealing with right now."
        actions={<Link className="mkt-btn mkt-btn--primary" href="/demo">Book demo</Link>}
      />

      <section className="mkt-section">
        <MarketingSectionHeading
          eyebrow="Who it helps"
          title="Different teams feel the benefit in different parts of the day."
          lead="MyTitan is strongest when owners, service managers, and office teams are all dealing with the same work from different angles."
        />
        <div className="mkt-solutionGrid">
          {solutionGroups.map((group) => (
            <article key={group.title} className="mkt-proof">
              <h3>{group.title}</h3>
              <p>{group.description}</p>
              <ul>
                {group.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-grid--2">
          <article className="mkt-card">
            <div className="mkt-eyebrow">What it solves</div>
            <h2 className="mkt-sectionTitle">The main gain is shared clarity.</h2>
            <p>Everyone works from the same customer, job, schedule, and follow-through record instead of keeping side notes in different tools.</p>
          </article>
          <article className="mkt-card">
            <div className="mkt-eyebrow">What changes</div>
            <h2 className="mkt-sectionTitle">Teams spend less time chasing status and more time moving work forward.</h2>
            <p>That is where MyTitan earns trust fastest: clearer handoffs, cleaner customer follow-up, and better billing discipline after the job.</p>
          </article>
        </div>
      </section>

      <MarketingCtaBand
        title="See how MyTitan would fit your team setup."
        copy="Use a demo to walk through the part of the workflow that is creating the most pressure today, then review how the rest connects around it."
        primaryLabel="Book demo"
        primaryHref="/demo"
        secondaryLabel="Sign in"
        secondaryHref="https://app.mytitan.co.uk/login"
      />
    </MarketingShell>
  );
}
