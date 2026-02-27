import { ServiceUnavailableException } from '@nestjs/common';

const normalizeFlag = (value?: string) => (value || '').trim().toLowerCase();

export const isMarketplaceEnabled = () => {
  const value = normalizeFlag(process.env.MYTITAN_FEATURE_MARKETPLACE);
  return value === 'on' || value === 'true' || value === '1';
};

export const requireMarketplaceEnabled = () => {
  if (!isMarketplaceEnabled()) {
    throw new ServiceUnavailableException('Feature is not enabled.');
  }
};
