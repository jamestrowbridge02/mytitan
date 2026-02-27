import { HttpException, HttpStatus } from '@nestjs/common';

type FeatureGateMode = 'read' | 'mutation';

type FeatureGateOptions<T> = {
  enabled: boolean;
  feature: string;
  mode: FeatureGateMode;
  fallback?: T;
};

export function featureGate<T>({ enabled, feature, mode, fallback }: FeatureGateOptions<T>): T | undefined {
  if (enabled) return undefined;
  if (mode === 'read' && fallback !== undefined) return fallback;
  throw new HttpException({ code: 'FEATURE_DISABLED', feature }, HttpStatus.SERVICE_UNAVAILABLE);
}
