import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PLAN_DEFINITIONS } from './billing.constants';
import { JOB_COMPLETION_PACK_DEFINITIONS } from './job-completion-products';
import { LIVE_COLLECTION_PROVIDERS, PROVIDER_READY_COLLECTION_PROVIDERS } from './payment-collection';

const PLAN_CODES = Object.keys(PLAN_DEFINITIONS);
const INTERVALS = ['MONTHLY', 'ANNUAL'];
const JOB_COMPLETION_PACK_CODES = JOB_COMPLETION_PACK_DEFINITIONS.map((pack) => pack.code);
const ADJUSTMENT_TYPES = ['percentage', 'fixed'];
const ADJUSTMENT_DURATIONS = ['one_time', 'recurring', 'until_date'];
const TENANT_PAYMENT_REQUEST_PROVIDERS = ['manual', 'stripe-connect', 'open-banking', 'paypal', 'gocardless', 'sumup', 'worldpay'];
const MANUAL_PAYMENT_METHODS = ['bank_transfer', 'cash', 'card_machine', 'cheque', 'other'];

export class CheckoutSessionDto {
  @IsIn(PLAN_CODES)
  planCode!: string;

  @IsIn(INTERVALS)
  interval!: 'MONTHLY' | 'ANNUAL';
}

export class JobCompletionPackCheckoutSessionDto {
  @IsIn(JOB_COMPLETION_PACK_CODES)
  packCode!: string;
}

export class PricingAdjustmentDto {
  @IsIn(ADJUSTMENT_TYPES)
  type!: 'percentage' | 'fixed';

  @IsNumber()
  @Min(0.01)
  @Max(1000000)
  value!: number;

  @IsIn(ADJUSTMENT_DURATIONS)
  duration!: 'one_time' | 'recurring' | 'until_date';

  @ValidateIf((object) => object.duration === 'until_date')
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsBoolean()
  confirmation!: boolean;
}

export class TrialOverrideDto {
  @IsOptional()
  @IsIn(['set', 'extend', 'pause', 'resume', 'expire'])
  action?: 'set' | 'extend' | 'pause' | 'resume' | 'expire';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  extendDays?: number;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endsAt?: string | null;

  @IsBoolean()
  confirmation!: boolean;

  @IsString()
  @MaxLength(240)
  reason!: string;
}

export class UpdatePaymentCollectionDto {
  @IsOptional()
  @IsIn(LIVE_COLLECTION_PROVIDERS)
  preferredProvider?: 'STRIPE' | 'MANUAL' | 'SUMUP' | 'WORLDPAY';

  @IsOptional()
  @Type(() => String)
  @IsArray()
  @IsIn(PROVIDER_READY_COLLECTION_PROVIDERS, { each: true })
  requestedProviders?: Array<'SUMUP' | 'WORLDPAY'>;
}

export class InvoiceTermsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
}

export class GenerateStatementDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  tradeAccountId?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class SendStatementDto {
  @IsOptional()
  @IsString()
  email?: string;
}

export class CustomerPaymentRequestDto {
  @IsOptional()
  @IsIn(['customer', 'job', 'booking', 'invoice', 'statement', 'standalone'])
  sourceType?: 'customer' | 'job' | 'booking' | 'invoice' | 'statement' | 'standalone';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bookingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  statementId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipientPhone?: string;

  @IsOptional()
  @IsIn(['email', 'sms', 'copy_link', 'customer_portal', 'trade_portal'])
  deliveryChannel?: 'email' | 'sms' | 'copy_link' | 'customer_portal' | 'trade_portal';

  @IsOptional()
  @IsBoolean()
  allowOverRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPartialPayment?: boolean;

  @IsOptional()
  @IsIn(TENANT_PAYMENT_REQUEST_PROVIDERS)
  provider?: 'manual' | 'stripe-connect' | 'open-banking' | 'paypal' | 'gocardless' | 'sumup' | 'worldpay';

  @IsOptional()
  @IsBoolean()
  send?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ManualPaymentRequestPaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsIn(MANUAL_PAYMENT_METHODS)
  method?: 'bank_transfer' | 'cash' | 'card_machine' | 'cheque' | 'other';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountReceivedCents?: number;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  evidenceArtifactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  customerReceiptNote?: string;
}

export class PaymentReconciliationReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}

export class FinanceReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RefundPaymentDto {
  @IsString()
  jobId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsIn(['manual_record', 'stripe'])
  mode?: 'manual_record' | 'stripe';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

export class BillingBalanceAdjustmentDto {
  @IsString()
  jobId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountCents!: number;

  @IsIn(['credit', 'debit'])
  direction!: 'credit' | 'debit';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

export class RefundBookingDepositDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}
