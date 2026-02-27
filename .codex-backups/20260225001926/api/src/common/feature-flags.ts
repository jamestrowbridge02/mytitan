import { ServiceUnavailableException } from '@nestjs/common';

const normalizeFlag = (value?: string) => (value || '').trim().toLowerCase();

const isFlagOn = (value?: string) => {
  const normalized = normalizeFlag(value);
  return normalized === 'on' || normalized === 'true' || normalized === '1';
};

export const isMarketplaceEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MARKETPLACE);
export const isTradePacksEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_TRADE_PACKS);
export const isStartHereEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_START_HERE);
export const isWheelsFormV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_WHEELS_FORM_V1);
export const isWheelsAutomationV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_WHEELS_AUTOMATION_V1);
export const isPortalPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_PORTAL_POLISH_V1);
export const isGuidedSetupV2Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_GUIDED_SETUP_V2);
export const isPublicDemoEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_PUBLIC_DEMO);
export const isCommandCentreEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE);
export const isCrmV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CRM_V1);
export const isDraftsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DRAFTS_V1);
export const isDemoTourV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DEMO_TOUR_V1);
export const isAuthPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTH_POLISH_V1);
export const isMarketingPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MARKETING_POLISH_V1);
export const isCommandCentreV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_V1);
export const isLocationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOCATIONS_V1);
export const isInventoryV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_INVENTORY_V1);
export const isLogoutV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOGOUT_V1);
export const isCommandCentrePremiumV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_PREMIUM_V1);
export const isGuidedEverywhereV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_GUIDED_EVERYWHERE_V1);
export const isAuthSecurityV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTH_SECURITY_V1);
export const isLocationsAdvancedV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOCATIONS_ADVANCED_V1);
export const isInventoryProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_INVENTORY_PRO_V1);
export const isCommandCentreV2Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_V2);
export const isBookingProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_BOOKING_PRO_V1);
export const isCrmProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CRM_PRO_V1);

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

export const requireStartHereEnabled = () => {
  if (!isStartHereEnabled()) {
    throw new ServiceUnavailableException('Start Here is not enabled.');
  }
};


export const requireWheelsFormV1Enabled = () => {
  if (!isWheelsFormV1Enabled()) {
    throw new ServiceUnavailableException('Wheels form v1 is not enabled.');
  }
};

export const requireWheelsAutomationV1Enabled = () => {
  if (!isWheelsAutomationV1Enabled()) {
    throw new ServiceUnavailableException('Wheels automation v1 is not enabled.');
  }
};

export const requireCommandCentreV2Enabled = () => {
  if (!isCommandCentreV2Enabled()) {
    throw new ServiceUnavailableException('Command Centre v2 is not enabled.');
  }
};

export const requireBookingProV1Enabled = () => {
  if (!isBookingProV1Enabled()) {
    throw new ServiceUnavailableException('Booking Pro v1 is not enabled.');
  }
};

export const requireCrmProV1Enabled = () => {
  if (!isCrmProV1Enabled()) {
    throw new ServiceUnavailableException('CRM Pro v1 is not enabled.');
  }
};
