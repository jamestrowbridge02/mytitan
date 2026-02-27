import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class OnboardingStepDto {
  @IsInt()
  @Min(0)
  @Max(5)
  step!: number;

  @IsOptional()
  data?: Record<string, any>;
}

export class IntegrationToggleDto {
  @IsString()
  key!: string;

  @IsBoolean()
  enabled!: boolean;
}
