import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../billing/billing.constants';

export const FEATURE_KEY = 'feature_key';

export const Feature = (feature: FeatureKey) => SetMetadata(FEATURE_KEY, feature);
