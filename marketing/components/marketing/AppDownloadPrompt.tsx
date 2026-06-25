import { useState } from "react";
import Link from "next/link";
import { APP_URL, SIGN_IN_URL } from "../../lib/site-content";

export function AppDownloadPrompt({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={compact ? "mkt-btn mkt-btn--compact" : "mkt-btn"}
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        data-testid="marketing-app-download-open"
        aria-haspopup="dialog"
      >
        Get the app
      </button>

      {open ? (
        <div className="mkt-dialogBackdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="mkt-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-app-download-title"
            data-testid="marketing-app-download-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mkt-dialog__header">
              <div>
                <div className="mkt-eyebrow">MyTitan app</div>
                <h2 id="marketing-app-download-title" className="mkt-sectionTitle" style={{ marginTop: 12 }}>
                  Install MyTitan from the live app, not from the marketing site.
                </h2>
              </div>
              <button className="mkt-btn mkt-btn--ghost" type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="mkt-sectionLead">
              MyTitan does not show a fake app-store download. The installed app should come from the live app origin so its shortcut opens the real sign-in and workspace routes.
            </p>
            <div className="mkt-grid--2">
              <div className="mkt-card">
                <h3>Open the live app first</h3>
                <p>
                  Sign in on the live MyTitan app, then use your browser’s own <strong>Install app</strong> or <strong>Add to Home Screen</strong> option when it appears.
                </p>
                <p>
                  That keeps the installed shortcut on the real app origin instead of a marketing page.
                </p>
                <div className="mkt-actions" style={{ marginTop: 16 }}>
                  <a className="mkt-btn mkt-btn--primary" href={SIGN_IN_URL} data-testid="marketing-app-download-open-live-app">
                    Open live app sign-in
                  </a>
                </div>
              </div>
              <div className="mkt-card" data-testid="marketing-app-download-fallback">
                <h3>Fallback when install is unavailable</h3>
                <p>
                  Install support is still browser-dependent because MyTitan does not ship a fake native app or unsafe offline cache for signed-in pages.
                </p>
                <p>
                  If your browser does not offer <strong>Install app</strong> or <strong>Add to Home Screen</strong> yet, keep using the live browser experience at <strong>{APP_URL}</strong>.
                </p>
                <div className="mkt-actions" style={{ marginTop: 16 }}>
                  <Link className="mkt-btn" href="/contact">
                    Ask about supported install paths
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
