import { ServiceUnavailableException } from '@nestjs/common';

const normalizeFlag = (value?: string) => (value || '').trim().toLowerCase();

const isFlagOn = (value?: string) => {
  const normalized = normalizeFlag(value);
  return normalized === 'on' || normalized === 'true' || normalized === '1';
};

export const isMarketplaceEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MARKETPLACE);
export const isTradePacksEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_TRADE_PACKS);

export const requireMarketplaceEnabled = () => {
  if (!isMarketplaceEnabled()) {
    throw new ServiceUnavailableException('Feature is not enabled.');
  }
};

export const requireTradePacksEnabled = () => {
  if (!isTradePacksEnabled()) {
    throw new ServiceUnavailableException('Trade packs are not enabled.');
  }
};
