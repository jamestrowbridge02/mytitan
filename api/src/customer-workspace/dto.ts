import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export const CUSTOMER_APPROVAL_ENTITY_TYPES = ["JOB", "DOCUMENT", "SERVICE_PLAN", "QUOTE"] as const;
export const CUSTOMER_APPROVAL_KINDS = ["WORK_AUTHORIZATION", "DOCUMENT_ACKNOWLEDGEMENT", "PLAN_APPROVAL", "QUOTE_ACCEPTANCE"] as const;
export const CUSTOMER_SERVICE_PLAN_REQUEST_KINDS = [
  "PAUSE_REQUEST",
  "RESUME_REQUEST",
  "CANCEL_REQUEST",
  "CADENCE_CHANGE_REQUEST",
  "SCOPE_CHANGE_REQUEST",
] as const;

export class InviteCustomerAccountDto {
  @IsString()
  customerId!: string;
}

export class ActivateCustomerAccountDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class CustomerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class CreateCustomerApprovalDto {
  @IsString()
  customerId!: string;

  @IsIn(CUSTOMER_APPROVAL_ENTITY_TYPES)
  entityType!: (typeof CUSTOMER_APPROVAL_ENTITY_TYPES)[number];

  @IsString()
  entityId!: string;

  @IsIn(CUSTOMER_APPROVAL_KINDS)
  kind!: (typeof CUSTOMER_APPROVAL_KINDS)[number];
}

export class CustomerApprovalResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListCustomerApprovalsDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsIn(CUSTOMER_APPROVAL_ENTITY_TYPES)
  entityType?: (typeof CUSTOMER_APPROVAL_ENTITY_TYPES)[number];

  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "DECLINED"])
  status?: "PENDING" | "APPROVED" | "DECLINED";
}

export class CustomerServicePlanDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CustomerServicePlanChangeRequestDto {
  @IsIn(CUSTOMER_SERVICE_PLAN_REQUEST_KINDS)
  kind!: (typeof CUSTOMER_SERVICE_PLAN_REQUEST_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  portalVisible?: boolean;

  @IsOptional()
  @IsObject()
  payloadJson?: Record<string, any>;
}

export class CustomerJobExecutionAcknowledgementDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
