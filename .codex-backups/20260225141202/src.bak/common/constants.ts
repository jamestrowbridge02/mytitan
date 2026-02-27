export const ROLES = ['OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'] as const;
export type Role = (typeof ROLES)[number];

export const JOB_STATUSES = [
  'DRAFT',
  'OPEN',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const BOOKING_STATUSES = ['PENDING', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const TRADE_ACCOUNT_STATUSES = ['ACTIVE', 'ON_HOLD', 'CLOSED'] as const;
export type TradeAccountStatus = (typeof TRADE_ACCOUNT_STATUSES)[number];

export const CRM_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export const CRM_TASK_STATUS_INPUTS = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DONE', 'CLOSED', 'CANCELED'] as const;
export type CrmTaskStatusInput = (typeof CRM_TASK_STATUS_INPUTS)[number];

export const WHEEL_PRICING_MODES = ['PER_WHEEL', 'SET'] as const;
export type WheelPricingMode = (typeof WHEEL_PRICING_MODES)[number];

export const EMAIL_TEMPLATE_TYPES = ['JOB_NOTIFICATION', 'INVOICE', 'BOOKING_CONFIRMATION'] as const;
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];
