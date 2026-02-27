export type SuggestionReason =
  | 'WITHIN_WORKING_HOURS'
  | 'AVOIDS_TIME_OFF'
  | 'NO_OVERLAPS'
  | 'UNDER_CAPACITY'
  | 'OVER_CAPACITY'
  | 'EARLIEST_AVAILABLE';

export type SuggestedSlot = {
  technicianId: string;
  technicianName: string;
  startsAt: string;
  endsAt: string;
  score: number;
  reasons: SuggestionReason[];
};

export const SUGGESTION_REASON_LABELS: Record<SuggestionReason, string> = {
  WITHIN_WORKING_HOURS: 'Within working hours',
  AVOIDS_TIME_OFF: 'Avoids time off',
  NO_OVERLAPS: 'No overlaps',
  UNDER_CAPACITY: 'Under capacity',
  OVER_CAPACITY: 'Over capacity',
  EARLIEST_AVAILABLE: 'Earliest available',
};

export const SUGGESTION_REASON_DISPLAY_LIMIT = 4;

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function formatSuggestedSlotLabel(startsAt: string, technicianName: string) {
  const date = new Date(startsAt);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKey = formatDateKey(date);
  const dayLabel =
    dateKey === formatDateKey(today)
      ? 'Today'
      : dateKey === formatDateKey(tomorrow)
      ? 'Tomorrow'
      : date.toLocaleDateString(undefined, { weekday: 'short' });
  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel} ${timeLabel} • ${technicianName}`;
}
