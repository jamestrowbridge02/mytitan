const isEnabled = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'on' || normalized === 'true' || normalized === '1';
};

export const isMarketplaceEnabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE);
export const isTradePacksEnabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_TRADE_PACKS);
export const isStartHereEnabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_START_HERE);

export const isWheelsFormV1Enabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_WHEELS_FORM_V1);

export const isWheelsAutomationV1Enabled = () => isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_WHEELS_AUTOMATION_V1);

export const isPortalPolishV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PORTAL_POLISH_V1);

export const isGuidedSetupV2Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_SETUP_V2);

export const isPublicDemoEnabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO);

export const isCommandCentreEnabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE);

export const isCrmV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_CRM_V1);

export const isDraftsV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_DRAFTS_V1);

export const isDemoTourV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_DEMO_TOUR_V1);

export const isAuthPolishV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_AUTH_POLISH_V1);

export const isMarketingPolishV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1);

export const isCommandCentreV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_V1);

export const isLocationsV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_LOCATIONS_V1);

export const isInventoryV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_INVENTORY_V1);

export const isLogoutV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_LOGOUT_V1);

export const isCommandCentrePremiumV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_PREMIUM_V1);

export const isGuidedEverywhereV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_EVERYWHERE_V1);

export const isAuthSecurityV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_AUTH_SECURITY_V1);

export const isLocationsAdvancedV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_LOCATIONS_ADVANCED_V1);

export const isInventoryProV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_INVENTORY_PRO_V1);

export const isCommandCentreV2Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_V2);

export const isBookingProV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_BOOKING_PRO_V1);

export const isCrmProV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_CRM_PRO_V1);

export const isDemoPolishV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_DEMO_POLISH_V1);

export const isMediaSignatureV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_MEDIA_SIGNATURE_V1);

export const isNotificationsV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_NOTIFICATIONS_V1);

export const isAutomationsV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_AUTOMATIONS_V1);

export const isAnalyticsV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_ANALYTICS_V1);

export const isCalendarV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_CALENDAR_V1);

export const isCalendarV2DragEnabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_CALENDAR_V2_DRAG);
export const isCalendarV2HardConflictsEnabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_CALENDAR_V2_HARD_CONFLICTS);
export const isSchedulingIntelligenceV1Enabled = () =>
  isEnabled(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_SCHEDULING_INTELLIGENCE_V1);
