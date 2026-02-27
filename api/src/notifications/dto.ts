import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  jobComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}

export class MarkNotificationReadDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}
