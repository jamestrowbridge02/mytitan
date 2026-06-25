import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(query);
    const syncMatch = () => setMatches(mediaQuery.matches);

    syncMatch();
    mediaQuery.addEventListener("change", syncMatch);
    return () => mediaQuery.removeEventListener("change", syncMatch);
  }, [query]);

  return matches;
}
