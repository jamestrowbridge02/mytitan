"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCalendarV1Enabled = exports.requireAnalyticsV1Enabled = exports.requireAutomationsV1Enabled = exports.requireNotificationsV1Enabled = exports.requireCrmProV1Enabled = exports.requireBookingProV1Enabled = exports.requireCommandCentreV2Enabled = exports.requireWheelsAutomationV1Enabled = exports.requireWheelsFormV1Enabled = exports.requireStartHereEnabled = exports.requireTradePacksEnabled = exports.requireMarketplaceEnabled = exports.isCalendarV1Enabled = exports.isAnalyticsV1Enabled = exports.isAutomationsV1Enabled = exports.isNotificationsV1Enabled = exports.isMediaSignatureV1Enabled = exports.isDemoPolishV1Enabled = exports.isCrmProV1Enabled = exports.isBookingProV1Enabled = exports.isCommandCentreV2Enabled = exports.isInventoryProV1Enabled = exports.isLocationsAdvancedV1Enabled = exports.isAuthSecurityV1Enabled = exports.isGuidedEverywhereV1Enabled = exports.isCommandCentrePremiumV1Enabled = exports.isLogoutV1Enabled = exports.isInventoryV1Enabled = exports.isLocationsV1Enabled = exports.isCommandCentreV1Enabled = exports.isMarketingPolishV1Enabled = exports.isAuthPolishV1Enabled = exports.isDemoTourV1Enabled = exports.isDraftsV1Enabled = exports.isCrmV1Enabled = exports.isCommandCentreEnabled = exports.isPublicDemoEnabled = exports.isGuidedSetupV2Enabled = exports.isPortalPolishV1Enabled = exports.isWheelsAutomationV1Enabled = exports.isWheelsFormV1Enabled = exports.isStartHereEnabled = exports.isTradePacksEnabled = exports.isMarketplaceEnabled = void 0;
const common_1 = require("@nestjs/common");
const normalizeFlag = (value) => (value || '').trim().toLowerCase();
const isFlagOn = (value) => {
    const normalized = normalizeFlag(value);
    return normalized === 'on' || normalized === 'true' || normalized === '1';
};
const isMarketplaceEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MARKETPLACE);
exports.isMarketplaceEnabled = isMarketplaceEnabled;
const isTradePacksEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_TRADE_PACKS);
exports.isTradePacksEnabled = isTradePacksEnabled;
const isStartHereEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_START_HERE);
exports.isStartHereEnabled = isStartHereEnabled;
const isWheelsFormV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_WHEELS_FORM_V1);
exports.isWheelsFormV1Enabled = isWheelsFormV1Enabled;
const isWheelsAutomationV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_WHEELS_AUTOMATION_V1);
exports.isWheelsAutomationV1Enabled = isWheelsAutomationV1Enabled;
const isPortalPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_PORTAL_POLISH_V1);
exports.isPortalPolishV1Enabled = isPortalPolishV1Enabled;
const isGuidedSetupV2Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_GUIDED_SETUP_V2);
exports.isGuidedSetupV2Enabled = isGuidedSetupV2Enabled;
const isPublicDemoEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_PUBLIC_DEMO);
exports.isPublicDemoEnabled = isPublicDemoEnabled;
const isCommandCentreEnabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE);
exports.isCommandCentreEnabled = isCommandCentreEnabled;
const isCrmV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CRM_V1);
exports.isCrmV1Enabled = isCrmV1Enabled;
const isDraftsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DRAFTS_V1);
exports.isDraftsV1Enabled = isDraftsV1Enabled;
const isDemoTourV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DEMO_TOUR_V1);
exports.isDemoTourV1Enabled = isDemoTourV1Enabled;
const isAuthPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTH_POLISH_V1);
exports.isAuthPolishV1Enabled = isAuthPolishV1Enabled;
const isMarketingPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MARKETING_POLISH_V1);
exports.isMarketingPolishV1Enabled = isMarketingPolishV1Enabled;
const isCommandCentreV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_V1);
exports.isCommandCentreV1Enabled = isCommandCentreV1Enabled;
const isLocationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOCATIONS_V1);
exports.isLocationsV1Enabled = isLocationsV1Enabled;
const isInventoryV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_INVENTORY_V1);
exports.isInventoryV1Enabled = isInventoryV1Enabled;
const isLogoutV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOGOUT_V1);
exports.isLogoutV1Enabled = isLogoutV1Enabled;
const isCommandCentrePremiumV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_PREMIUM_V1);
exports.isCommandCentrePremiumV1Enabled = isCommandCentrePremiumV1Enabled;
const isGuidedEverywhereV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_GUIDED_EVERYWHERE_V1);
exports.isGuidedEverywhereV1Enabled = isGuidedEverywhereV1Enabled;
const isAuthSecurityV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTH_SECURITY_V1);
exports.isAuthSecurityV1Enabled = isAuthSecurityV1Enabled;
const isLocationsAdvancedV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_LOCATIONS_ADVANCED_V1);
exports.isLocationsAdvancedV1Enabled = isLocationsAdvancedV1Enabled;
const isInventoryProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_INVENTORY_PRO_V1);
exports.isInventoryProV1Enabled = isInventoryProV1Enabled;
const isCommandCentreV2Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_COMMAND_CENTRE_V2);
exports.isCommandCentreV2Enabled = isCommandCentreV2Enabled;
const isBookingProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_BOOKING_PRO_V1);
exports.isBookingProV1Enabled = isBookingProV1Enabled;
const isCrmProV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CRM_PRO_V1);
exports.isCrmProV1Enabled = isCrmProV1Enabled;
const isDemoPolishV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_DEMO_POLISH_V1);
exports.isDemoPolishV1Enabled = isDemoPolishV1Enabled;
const isMediaSignatureV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_MEDIA_SIGNATURE_V1);
exports.isMediaSignatureV1Enabled = isMediaSignatureV1Enabled;
const isNotificationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_NOTIFICATIONS_V1);
exports.isNotificationsV1Enabled = isNotificationsV1Enabled;
const isAutomationsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_AUTOMATIONS_V1);
exports.isAutomationsV1Enabled = isAutomationsV1Enabled;
const isAnalyticsV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_ANALYTICS_V1);
exports.isAnalyticsV1Enabled = isAnalyticsV1Enabled;
const isCalendarV1Enabled = () => isFlagOn(process.env.MYTITAN_FEATURE_CALENDAR_V1);
exports.isCalendarV1Enabled = isCalendarV1Enabled;
const requireMarketplaceEnabled = () => {
    if (!(0, exports.isMarketplaceEnabled)()) {
        throw new common_1.ServiceUnavailableException('Feature is not enabled.');
    }
};
exports.requireMarketplaceEnabled = requireMarketplaceEnabled;
const requireTradePacksEnabled = () => {
    if (!(0, exports.isTradePacksEnabled)()) {
        throw new common_1.ServiceUnavailableException('Trade packs are not enabled.');
    }
};
exports.requireTradePacksEnabled = requireTradePacksEnabled;
const requireStartHereEnabled = () => {
    if (!(0, exports.isStartHereEnabled)()) {
        throw new common_1.ServiceUnavailableException('Start Here is not enabled.');
    }
};
exports.requireStartHereEnabled = requireStartHereEnabled;
const requireWheelsFormV1Enabled = () => {
    if (!(0, exports.isWheelsFormV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Wheels form v1 is not enabled.');
    }
};
exports.requireWheelsFormV1Enabled = requireWheelsFormV1Enabled;
const requireWheelsAutomationV1Enabled = () => {
    if (!(0, exports.isWheelsAutomationV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Wheels automation v1 is not enabled.');
    }
};
exports.requireWheelsAutomationV1Enabled = requireWheelsAutomationV1Enabled;
const requireCommandCentreV2Enabled = () => {
    if (!(0, exports.isCommandCentreV2Enabled)()) {
        throw new common_1.ServiceUnavailableException('Command Centre v2 is not enabled.');
    }
};
exports.requireCommandCentreV2Enabled = requireCommandCentreV2Enabled;
const requireBookingProV1Enabled = () => {
    if (!(0, exports.isBookingProV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Booking Pro v1 is not enabled.');
    }
};
exports.requireBookingProV1Enabled = requireBookingProV1Enabled;
const requireCrmProV1Enabled = () => {
    if (!(0, exports.isCrmProV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('CRM Pro v1 is not enabled.');
    }
};
exports.requireCrmProV1Enabled = requireCrmProV1Enabled;
const requireNotificationsV1Enabled = () => {
    if (!(0, exports.isNotificationsV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Notifications v1 is not enabled.');
    }
};
exports.requireNotificationsV1Enabled = requireNotificationsV1Enabled;
const requireAutomationsV1Enabled = () => {
    if (!(0, exports.isAutomationsV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Automations v1 is not enabled.');
    }
};
exports.requireAutomationsV1Enabled = requireAutomationsV1Enabled;
const requireAnalyticsV1Enabled = () => {
    if (!(0, exports.isAnalyticsV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Analytics v1 is not enabled.');
    }
};
exports.requireAnalyticsV1Enabled = requireAnalyticsV1Enabled;
const requireCalendarV1Enabled = () => {
    if (!(0, exports.isCalendarV1Enabled)()) {
        throw new common_1.ServiceUnavailableException('Calendar v1 is not enabled.');
    }
};
exports.requireCalendarV1Enabled = requireCalendarV1Enabled;
//# sourceMappingURL=feature-flags.js.map