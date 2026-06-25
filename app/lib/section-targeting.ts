import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type RefCallback } from "react";

type SectionTargetingOptions = {
  targetKey?: string;
  ready?: boolean;
};

type SectionProps<T extends HTMLElement> = HTMLAttributes<T> & {
  ref: RefCallback<T>;
  "data-section-key": string;
  "data-section-highlighted": "true" | "false";
};

function getStickyOffset() {
  if (typeof window === "undefined") return 112;
  return window.innerWidth <= 768 ? 88 : 112;
}

export function useSectionTargeting({ targetKey, ready = true }: SectionTargetingOptions) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [highlightedSection, setHighlightedSection] = useState("");

  const scrollToSection = useCallback((key: string) => {
    const node = refs.current[key];
    if (!node || typeof window === "undefined") return false;

    const top = Math.max(0, window.scrollY + node.getBoundingClientRect().top - getStickyOffset());
    window.scrollTo({ top, behavior: "smooth" });
    if (!node.hasAttribute("tabindex")) {
      node.setAttribute("tabindex", "-1");
    }
    window.setTimeout(() => {
      node.focus({ preventScroll: true });
      setHighlightedSection(key);
      window.setTimeout(() => {
        setHighlightedSection((current) => (current === key ? "" : current));
      }, 2200);
    }, 120);
    return true;
  }, []);

  useEffect(() => {
    if (!ready || !targetKey) return;
    let cancelled = false;
    let timeoutId = 0;

    const attemptScroll = (attempt = 0) => {
      if (cancelled) return;
      if (scrollToSection(targetKey)) return;
      if (attempt >= 14) return;
      timeoutId = window.setTimeout(() => attemptScroll(attempt + 1), 90);
    };

    attemptScroll();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ready, scrollToSection, targetKey]);

  const registerSection = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      refs.current[key] = node;
    },
    [],
  );

  const getSectionProps = useCallback(
    <T extends HTMLElement>(key: string, className = ""): SectionProps<T> => ({
      ref: registerSection(key) as RefCallback<T>,
      className: `mt-target-section ${highlightedSection === key ? "mt-target-section--active" : ""} ${className}`.trim(),
      "data-section-key": key,
      "data-section-highlighted": highlightedSection === key ? "true" : "false",
      tabIndex: -1,
    }),
    [highlightedSection, registerSection],
  );

  return useMemo(
    () => ({
      getSectionProps,
      highlightedSection,
      scrollToSection,
    }),
    [getSectionProps, highlightedSection, scrollToSection],
  );
}
