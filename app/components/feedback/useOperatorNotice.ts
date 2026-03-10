import { useCallback, useEffect, useRef, useState } from "react";

export type OperatorNoticeState =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

export function useOperatorNotice(timeoutMs = 2200) {
  const [notice, setNotice] = useState<OperatorNoticeState>(null);
  const timerRef = useRef<number | null>(null);

  const clearNotice = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotice(null);
  }, []);

  useEffect(() => clearNotice, [clearNotice]);

  useEffect(() => {
    if (!notice) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setNotice(null);
    }, timeoutMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [notice, timeoutMs]);

  const showSuccess = useCallback((message: string) => {
    setNotice({ kind: "success", message });
  }, []);

  const showError = useCallback((message: string) => {
    setNotice({ kind: "error", message });
  }, []);

  return {
    notice,
    showSuccess,
    showError,
    clearNotice,
  };
}
