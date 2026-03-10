import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { isMarketplaceEnabled } from "../../lib/feature-flags";

type BookingSettings = {
  publicEnabled: boolean;
  publicUrl?: string | null;
  icsUrl?: string | null;
  businessHours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  blackoutDates: Array<{ date: string; reason?: string | null }>;
  slotMinutes: number;
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [blackoutDates, setBlackoutDates] = useState<Array<{ date: string; reason?: string | null }>>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");
  const [saving, setSaving] = useState(false);
  const marketplaceEnabled = isMarketplaceEnabled();

  const load = () => {
    apiFetch("/bookings")
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || "Failed to load bookings"));
  };

  const loadSettings = () => {
    if (!marketplaceEnabled) return;
    apiFetch("/bookings/settings")
      .then((data) => {
        setSettings(data);
        setPublicEnabled(Boolean(data.publicEnabled));
        setBlackoutDates(Array.isArray(data.blackoutDates) ? data.blackoutDates : []);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    loadSettings();
  }, [marketplaceEnabled]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          startsAt,
          endsAt,
          jobId: jobId || undefined,
        }),
      });
      setStartsAt("");
      setEndsAt("");
      setJobId("");
      load();
    } catch (err: any) {
      setError(err.message || "Failed to create booking");
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    try {
      const [startH, startM] = startHour.split(":").map(Number);
      const [endH, endM] = endHour.split(":").map(Number);
      const startMinute = startH * 60 + startM;
      const endMinute = endH * 60 + endM;
      const businessHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }));

      const updated = await apiFetch("/bookings/settings", {
        method: "POST",
        body: JSON.stringify({
          publicEnabled,
          businessHours,
          blackoutDates,
        }),
      });
      setSettings(updated);
    } catch (err: any) {
      setError(err.message || "Failed to update booking settings");
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const linkedJobs = bookings.filter((booking) => booking.jobId).length;
    return [
      { label: "Bookings", value: String(bookings.length), hint: `${linkedJobs} linked to jobs` },
      { label: "Public booking", value: publicEnabled ? "Live" : "Off", hint: publicEnabled ? "Customers can request time" : "Internal only" },
      { label: "Blackouts", value: String(blackoutDates.length), hint: "Protected unavailable dates" },
    ];
  }, [blackoutDates.length, bookings, publicEnabled]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Scheduling"
          title="Bookings"
          subtitle="Handle manual bookings, keep the public link under control, and move straight into the live calendar when timings change."
          actions={[
            { label: "Calendar", href: "/dashboard/calendar", variant: "secondary" },
            { label: "Booking settings", href: "/dashboard/booking/settings" },
          ]}
          shortcuts={["Public booking link and blackout controls stay on this page", "Use Calendar for drag rescheduling"]}
          stats={stats}
        />

        {error ? <p style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}

        <div className={marketplaceEnabled && settings ? "operator-split" : "operator-stack"}>
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Create booking</h2>
                <p className="operator-section__subtitle">Keep manual entry compact and close to the live queue.</p>
              </div>
            </div>

            <form onSubmit={onCreate} className="operator-stack">
              <div className="operator-formGrid">
                <div>
                  <label>Start time</label>
                  <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
                </div>
                <div>
                  <label>End time</label>
                  <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
                </div>
              </div>

              <div>
                <label>Job ID (optional)</label>
                <input className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} />
              </div>

              <div className="operator-inline-actions">
                <button className="button" type="submit">Create booking</button>
                <Link className="button secondary" href="/dashboard/calendar">
                  Open calendar
                </Link>
              </div>
            </form>
          </section>

          {marketplaceEnabled && settings ? (
            <section className="card operator-section">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Public booking controls</h2>
                  <p className="operator-section__subtitle">Keep the share link, working window, and blackout dates together.</p>
                </div>
              </div>

              <div className="operator-stack">
                <div>
                  <div className="operator-kicker">Public link</div>
                  <div className="operator-row__subtitle" style={{ marginTop: 6 }}>
                    {settings.publicUrl || "Enable public bookings to generate a shareable link."}
                  </div>
                  {settings.icsUrl ? <div className="operator-note" style={{ marginTop: 6 }}>ICS feed: {settings.icsUrl}</div> : null}
                </div>

                <label className="toggle-row">
                  <input type="checkbox" checked={publicEnabled} onChange={(e) => setPublicEnabled(e.target.checked)} />
                  Enable public bookings
                </label>

                <div className="operator-formGrid">
                  <div>
                    <label>Start time</label>
                    <input className="input" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                  </div>
                  <div>
                    <label>End time</label>
                    <input className="input" type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                  </div>
                </div>

                <div>
                  <div className="operator-kicker">Blackout dates</div>
                  <div className="operator-note" style={{ marginTop: 6 }}>Block dates you cannot accept bookings.</div>
                  <div className="operator-formGrid" style={{ marginTop: 10 }}>
                    <input className="input" type="date" value={newBlackoutDate} onChange={(e) => setNewBlackoutDate(e.target.value)} />
                    <input className="input" placeholder="Reason (optional)" value={newBlackoutReason} onChange={(e) => setNewBlackoutReason(e.target.value)} />
                  </div>
                  <div className="operator-inline-actions" style={{ marginTop: 8 }}>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        if (!newBlackoutDate) return;
                        setBlackoutDates((prev) => [...prev, { date: newBlackoutDate, reason: newBlackoutReason || null }]);
                        setNewBlackoutDate("");
                        setNewBlackoutReason("");
                      }}
                    >
                      Add blackout date
                    </button>
                  </div>
                </div>

                {blackoutDates.length ? (
                  <div className="operator-list">
                    {blackoutDates.map((item) => (
                      <article key={`${item.date}-${item.reason || ""}`} className="operator-row">
                        <div className="operator-row__main">
                          <div className="operator-row__title">{item.date}</div>
                          <div className="operator-row__subtitle">{item.reason || "No reason added"}</div>
                        </div>
                        <div className="operator-row__meta">
                          <div className="operator-row__metaLine">Availability block</div>
                        </div>
                        <div className="operator-row__actions">
                          <button
                            className="button secondary operator-compact-button"
                            type="button"
                            onClick={() => setBlackoutDates((prev) => prev.filter((entry) => entry !== item))}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="operator-inline-actions">
                  <button className="button" type="button" onClick={saveSettings} disabled={saving}>
                    {saving ? "Saving..." : "Save booking settings"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Recent bookings</h2>
              <p className="operator-section__subtitle">Compact queue for immediate schedule checks and customer context.</p>
            </div>
          </div>

          {bookings.length ? (
            <div className="operator-list">
              {bookings.map((booking) => (
                <article key={booking.id} className="operator-row">
                  <div className="operator-row__main">
                    <div className="operator-row__title">
                      <Link href={`/dashboard/bookings/${booking.id}`}>{new Date(booking.startsAt).toLocaleString()}</Link>
                      <span className="badge">{booking.status}</span>
                    </div>
                    <div className="operator-row__subtitle">{booking.customerName || "Customer not attached"}</div>
                  </div>

                  <div className="operator-row__meta">
                    <div className="operator-row__metaLine">
                      Ends: <strong>{new Date(booking.endsAt).toLocaleString()}</strong>
                    </div>
                    <div className="operator-row__metaLine">
                      Job: <strong>{booking.jobId || "Not linked"}</strong>
                    </div>
                  </div>

                  <div className="operator-row__actions">
                    <Link className="button secondary operator-compact-button" href={`/dashboard/bookings/${booking.id}`}>
                      Open
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : !error ? (
            <div className="operator-empty">
              <h3>No bookings yet</h3>
              <p className="muted">Create the first slot here or move into Calendar once the schedule is live.</p>
              <div className="operator-empty__actions">
                <Link className="button" href="/dashboard/calendar">
                  Open calendar
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
