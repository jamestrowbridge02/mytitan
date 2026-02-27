"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsModule = void 0;
const common_1 = require("@nestjs/common");
const audit_module_1 = require("../audit/audit.module");
const automations_module_1 = require("../automations/automations.module");
const feature_guard_1 = require("../common/feature.guard");
const notifications_module_1 = require("../notifications/notifications.module");
const tenant_module_1 = require("../tenant/tenant.module");
const booking_pro_controller_1 = require("./booking-pro.controller");
const bookings_controller_1 = require("./bookings.controller");
const bookings_service_1 = require("./bookings.service");
let BookingsModule = class BookingsModule {
};
exports.BookingsModule = BookingsModule;
exports.BookingsModule = BookingsModule = __decorate([
    (0, common_1.Module)({
        imports: [audit_module_1.AuditModule, tenant_module_1.TenantModule, notifications_module_1.NotificationsModule, automations_module_1.AutomationsModule],
        controllers: [bookings_controller_1.BookingsController, booking_pro_controller_1.BookingProController],
        providers: [bookings_service_1.BookingsService, feature_guard_1.FeatureGuard],
        exports: [bookings_service_1.BookingsService],
    })
], BookingsModule);
//# sourceMappingURL=bookings.module.js.map