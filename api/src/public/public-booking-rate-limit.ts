export const PUBLIC_BOOKING_RATE_LIMIT_MESSAGE = 'Too many attempts. Please wait a moment and try again.';

type PublicBookingRateLimitAction =
  | 'booking-slots'
  | 'booking-create'
  | 'booking-status'
  | 'booking-status-slots'
  | 'booking-status-reschedule'
  | 'booking-status-cancel'
  | 'booking-status-deposit';

type PublicBookingRateLimitConfig = {
  limit: number;
  windowMs: number;
  envLimit: string;
  envWindowMs: string;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildConfig(limit: number, windowMs: number, envLimit: string, envWindowMs: string): PublicBookingRateLimitConfig {
  return {
    limit: parsePositiveInt(process.env[envLimit], limit),
    windowMs: parsePositiveInt(process.env[envWindowMs], windowMs),
    envLimit,
    envWindowMs,
  };
}

export const PUBLIC_BOOKING_RATE_LIMITS: Record<PublicBookingRateLimitAction, PublicBookingRateLimitConfig> = {
  'booking-slots': buildConfig(600, 60 * 1000, 'PUBLIC_BOOKING_SLOTS_RATE_LIMIT', 'PUBLIC_BOOKING_SLOTS_RATE_WINDOW_MS'),
  'booking-create': buildConfig(25, 60 * 1000, 'PUBLIC_BOOKING_CREATE_RATE_LIMIT', 'PUBLIC_BOOKING_CREATE_RATE_WINDOW_MS'),
  'booking-status': buildConfig(300, 60 * 1000, 'PUBLIC_BOOKING_STATUS_RATE_LIMIT', 'PUBLIC_BOOKING_STATUS_RATE_WINDOW_MS'),
  'booking-status-slots': buildConfig(600, 60 * 1000, 'PUBLIC_BOOKING_STATUS_SLOTS_RATE_LIMIT', 'PUBLIC_BOOKING_STATUS_SLOTS_RATE_WINDOW_MS'),
  'booking-status-reschedule': buildConfig(
    20,
    60 * 1000,
    'PUBLIC_BOOKING_RESCHEDULE_RATE_LIMIT',
    'PUBLIC_BOOKING_RESCHEDULE_RATE_WINDOW_MS',
  ),
  'booking-status-cancel': buildConfig(
    20,
    60 * 1000,
    'PUBLIC_BOOKING_CANCEL_RATE_LIMIT',
    'PUBLIC_BOOKING_CANCEL_RATE_WINDOW_MS',
  ),
  'booking-status-deposit': buildConfig(
    15,
    60 * 1000,
    'PUBLIC_BOOKING_DEPOSIT_RATE_LIMIT',
    'PUBLIC_BOOKING_DEPOSIT_RATE_WINDOW_MS',
  ),
};

export function getPublicBookingRateLimit(action: PublicBookingRateLimitAction) {
  return PUBLIC_BOOKING_RATE_LIMITS[action];
}

export function isPublicBookingRateLimitConfigured() {
  return Object.values(PUBLIC_BOOKING_RATE_LIMITS).every((config) => config.limit > 0 && config.windowMs > 0);
}
