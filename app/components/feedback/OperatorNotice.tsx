import type { ReactNode } from "react";
import type { OperatorNoticeState } from "./useOperatorNotice";

export function OperatorNotice({
  notice,
  onDismiss,
  actions,
}: {
  notice: OperatorNoticeState;
  onDismiss: () => void;
  actions?: ReactNode;
}) {
  if (!notice) return null;

  const isError = notice.kind === "error";

  return (
    <div
      aria-live="polite"
      className={`operator-notice ${notice.kind}`}
      data-testid={`operator-notice-${notice.kind}`}
      role={isError ? "alert" : "status"}
    >
      <div className="operator-notice__body">
        <div className="operator-notice__message" data-testid="operator-notice-message">{notice.message}</div>
        {actions ? <div className="operator-notice__actions">{actions}</div> : null}
      </div>
      <button
        aria-label="Dismiss notice"
        className="operator-notice__dismiss"
        data-testid="operator-notice-dismiss"
        type="button"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
