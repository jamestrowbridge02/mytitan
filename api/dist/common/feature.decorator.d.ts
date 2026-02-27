import type { FeatureKey } from '../billing/billing.constants';
export declare const FEATURE_KEY = "feature_key";
export declare const Feature: (feature: FeatureKey) => import("@nestjs/common").CustomDecorator<string>;
