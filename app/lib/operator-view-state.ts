import { useEffect, useState } from "react";

export function useStickyOperatorView<T extends string>(storageKey: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        setValue(stored as T);
      }
    } finally {
      setReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(storageKey, value);
  }, [ready, storageKey, value]);

  return [value, setValue, ready] as const;
}
