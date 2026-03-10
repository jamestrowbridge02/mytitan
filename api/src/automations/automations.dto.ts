import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

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
