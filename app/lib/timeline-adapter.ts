import type { EntityTimelineItem } from '../components/entity/EntityTimeline';

function safeTimestamp(value?: string | number | Date | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function sortTimelineItems(items: EntityTimelineItem[]) {
  return [...items].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
}

export function toTimelineItemsFromJobActivity(activity: Array<{ eventType?: string; message?: string; createdAt?: string }> = []): EntityTimelineItem[] {
  const items = activity.map((entry) => ({
    label: (entry.eventType || 'Activity').toString().replace(/_/g, ' '),
    description: entry.message || 'Update recorded',
    timestamp: safeTimestamp(entry.createdAt),
  }));
  return sortTimelineItems(items);
}

export function toTimelineItemsFromBookingActivity(activity: Array<{ label?: string; message?: string; createdAt?: string; href?: string }> = []): EntityTimelineItem[] {
  const items = activity.map((entry) => ({
    label: entry.label || 'Booking update',
    description: entry.message,
    timestamp: safeTimestamp(entry.createdAt),
    href: entry.href,
  }));
  return sortTimelineItems(items);
}

export function toTimelineItemsFromCrmNotes(activity: Array<{ type?: string; createdAt?: string; data?: any }> = []): EntityTimelineItem[] {
  const items = activity.map((entry) => {
    const jobId = entry?.data?.id || entry?.data?.jobId;
    const bookingId = entry?.data?.id || entry?.data?.bookingId;
    const href =
      entry?.type === 'job' && jobId ? `/dashboard/jobs/${jobId}` :
      entry?.type === 'booking' && bookingId ? `/dashboard/bookings/${bookingId}` :
      undefined;

    return {
      label: (entry.type || 'activity').toString().replace(/_/g, ' '),
      description: entry.data?.body || entry.data?.jobRef || entry.data?.customerName || entry.data?.message || 'Activity logged',
      timestamp: safeTimestamp(entry.createdAt),
      href,
    };
  });
  return sortTimelineItems(items);
}

const COMM_REASON_LABELS: Record<string, string> = {
  'job.complete': 'Job completed',
  'payment.received': 'Payment received',
  'booking.reminder': 'Booking reminder',
  'booking.confirmed': 'Booking confirmed',
  'job.update': 'Job update',
  'job.approval.request': 'Approval request',
  'approval_request': 'Approval request',
  'booking_reminder_24h': 'Booking reminder (24h)',
  'booking_reminder_2h': 'Booking reminder (2h)',
  'review_request': 'Review request',
};

function formatCommsLabel(channel?: string, status?: string) {
  const channelLabel =
    channel?.toLowerCase() === 'sms'
      ? 'SMS'
      : channel?.toLowerCase() === 'email'
      ? 'Email'
      : channel?.toLowerCase() === 'whatsapp'
      ? 'WhatsApp'
      : 'Message';
  const statusLabel =
    status?.toLowerCase() === 'queued'
      ? 'Queued'
      : status?.toLowerCase() === 'failed'
      ? 'Failed'
      : 'Sent';
  return `${channelLabel} ${statusLabel}`;
}

export function toTimelineItemsFromCommsEvents(
  events: Array<{ channel?: string; status?: string; reasonKey?: string; title?: string; createdAt?: string }> = [],
): EntityTimelineItem[] {
  const items = events.map((event) => {
    const reasonKey = event.reasonKey ? String(event.reasonKey) : '';
    const reason = COMM_REASON_LABELS[reasonKey] || (event.title || reasonKey || 'Outbound update');
    return {
      label: formatCommsLabel(event.channel, event.status),
      description: reason ? `Reason: ${reason}` : undefined,
      timestamp: safeTimestamp(event.createdAt),
    };
  });
  return sortTimelineItems(items);
}
