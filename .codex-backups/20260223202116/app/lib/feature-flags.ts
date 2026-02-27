const isEnabled = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'on' || normalized === 'true' || normalized === '1';
};

export const isMarketplaceEnabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE);
export const isTradePacksEnabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_TRADE_PACKS);
