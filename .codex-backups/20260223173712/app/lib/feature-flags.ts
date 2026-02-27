export const isMarketplaceEnabled = () => {
  const value = (process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE || '').trim().toLowerCase();
  return value === 'on' || value === 'true' || value === '1';
};
