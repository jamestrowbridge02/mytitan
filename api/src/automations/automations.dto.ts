import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { AUTOMATION_RULE_TRIGGERS } from "./rule-engine";

export class UpdateAutomationsSettingsDto {
  @IsOptional()
  @IsBoolean()
  bookingRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  approvalRequestEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewRequestEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  jobCompletionFollowUpEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  jobContactGapEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(["metadata_only", "live_send"])
  deliveryMode?: "metadata_only" | "live_send";

  @IsOptional()
  @IsBoolean()
  confirmLiveSend?: boolean;
}

export class CreateAutomationRuleDto {
  @IsString()
  name!: string;

  @IsString()
  @IsIn(AUTOMATION_RULE_TRIGGERS)
  trigger!: (typeof AUTOMATION_RULE_TRIGGERS)[number];

  @IsOptional()
  @IsObject()
  conditionJson?: Record<string, any>;

  @IsObject()
  actionJson!: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(AUTOMATION_RULE_TRIGGERS)
  trigger?: (typeof AUTOMATION_RULE_TRIGGERS)[number];

  @IsOptional()
  @IsObject()
  conditionJson?: Record<string, any>;

  @IsOptional()
  @IsObject()
  actionJson?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
