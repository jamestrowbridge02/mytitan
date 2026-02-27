export declare const ONBOARDING_TRADE_VALUES: readonly ["WHEELS", "BODYSHOP", "GARAGE", "MOBILE"];
export type OnboardingTrade = (typeof ONBOARDING_TRADE_VALUES)[number];
export declare class OnboardingStepDto {
    step: number;
    data?: Record<string, any>;
}
export declare class IntegrationToggleDto {
    key: string;
    enabled: boolean;
}
export declare class SelectTradeDto {
    trade: OnboardingTrade;
}
