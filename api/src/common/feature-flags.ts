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
export const isGuidedSetupV2Enabled = () =>
  isFlagOn(process.env.MYTITAN_FEATURE_GUIDED_SETUP_V2) || isStartHereEnabled();
export const isCommandCentreEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE);
export const isCrmV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CRM_V1);
export const isDraftsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DRAFTS_V1);

export const isOnboardingTourV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DEMO_TOUR_V1);
export const isDemoTourV1Enabled = () => isOnboardingTourV1Enabled();
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

export const isOnboardingPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DEMO_POLISH_V1);
export const isDemoPolishV1Enabled = () => isOnboardingPolishV1Enabled();
export const isMediaSignatureV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MEDIA_SIGNATURE_V1);
export const isNotificationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_NOTIFICATIONS_V1);
export const isAutomationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTOMATIONS_V1);
export const isAnalyticsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_ANALYTICS_V1);
export const isCalendarV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CALENDAR_V1);
export const isCalendarV2DragEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CALENDAR_V2_DRAG);
export const isCalendarV2HardConflictsEnabled = () =>
  isFlagOn(process.env.MYTITAN_FEATURE_CALENDAR_V2_HARD_CONFLICTS);
export const isSchedulingIntelligenceV1Enabled = () =>
  isFlagOn(process.env.MYTITAN_FEATURE_SCHEDULING_INTELLIGENCE_V1);

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

export const requireNotificationsV1Enabled = () => {
  if (!isNotificationsV1Enabled()) {
    throw new ServiceUnavailableException('Notifications v1 is not enabled.');
  }
};

export const requireAutomationsV1Enabled = () => {
  if (!isAutomationsV1Enabled()) {
    throw new ServiceUnavailableException('Automations v1 is not enabled.');
  }
};

export const requireAnalyticsV1Enabled = () => {
  if (!isAnalyticsV1Enabled()) {
    throw new ServiceUnavailableException('Analytics v1 is not enabled.');
  }
};

export const requireCalendarV1Enabled = () => {
  if (!isCalendarV1Enabled()) {
    throw new ServiceUnavailableException('Scheduling calendar is not available in this environment.');
  }
};

export const requireCalendarV2DragEnabled = () => {
  if (!isCalendarV2DragEnabled()) {
    throw new ServiceUnavailableException('Calendar drag rescheduling is not enabled.');
  }
};

export const requireSchedulingIntelligenceV1Enabled = () => {
  if (!isSchedulingIntelligenceV1Enabled()) {
    throw new ServiceUnavailableException('Scheduling Intelligence v1 is not enabled.');
  }
};

export const isSettingsPrimaryTradeV1Enabled = () => isFlagOn(process.env.MYTITAN_SETTINGS_PRIMARY_TRADE_V1);
