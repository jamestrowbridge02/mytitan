import React from 'react';
import { SUGGESTION_REASON_DISPLAY_LIMIT, SUGGESTION_REASON_LABELS, SuggestionReason } from '../lib/suggested-slot';

type SuggestedSlotReasonsProps = {
  reasons?: SuggestionReason[];
};

export function SuggestedSlotReasons({ reasons }: SuggestedSlotReasonsProps) {
  if (!reasons?.length) {
    return null;
  }
  return (
    <div
      style={{
        marginTop: 4,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
      }}
    >
      {reasons.slice(0, SUGGESTION_REASON_DISPLAY_LIMIT).map((reason) => (
        <span
          key={reason}
          className="muted"
          style={{
            padding: '2px 6px',
            borderRadius: 999,
            fontSize: 10,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            color: '#475569',
            whiteSpace: 'nowrap',
          }}
        >
          {SUGGESTION_REASON_LABELS[reason]}
        </span>
      ))}
    </div>
  );
}
