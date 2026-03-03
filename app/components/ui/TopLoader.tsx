import React from "react";
import Router from "next/router";

function isOn(v?: string) {
  const s = (v || "").trim().toLowerCase();
  return s === "on" || s === "true" || s === "1";
}

/**
 * Minimal, production-safe top loader.
 * - No external deps
 * - Respects reduced motion via CSS
 * - Feature-flagged by NEXT_PUBLIC_MYTITAN_UI_PERF_V1
 */
export function TopLoader() {
  const enabled = isOn(process.env.NEXT_PUBLIC_MYTITAN_UI_PERF_V1);
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;

    let doneTimer: any = null;

    const start = () => {
      if (doneTimer) clearTimeout(doneTimer);
      setActive(true);
    };

    const done = () => {
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => setActive(false), 180);
    };

    Router.events.on("routeChangeStart", start);
    Router.events.on("routeChangeComplete", done);
    Router.events.on("routeChangeError", done);

    return () => {
      Router.events.off("routeChangeStart", start);
      Router.events.off("routeChangeComplete", done);
      Router.events.off("routeChangeError", done);
      if (doneTimer) clearTimeout(doneTimer);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      data-toploader={active ? "on" : "off"}
      className="mt-toploader"
    />
  );
}
