import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const ONBOARDING_TRADE_VALUES = ['WHEELS', 'BODYSHOP', 'GARAGE', 'MOBILE'] as const;
export type OnboardingTrade = (typeof ONBOARDING_TRADE_VALUES)[number];

export class OnboardingStepDto {
  @IsInt()
  @Min(0)
  @Max(6)
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

export class SelectTradeDto {
  @IsString()
  @IsIn(ONBOARDING_TRADE_VALUES)
  trade!: OnboardingTrade;
}
