"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingProController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const bookings_service_1 = require("./bookings.service");
const dto_1 = require("./dto");
let BookingProController = class BookingProController {
    constructor(bookingsService) {
        this.bookingsService = bookingsService;
    }
    services(user, locationId) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.listProServices(user.companyId, locationId);
    }
    createService(user, dto) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.createProService(user.companyId, user.sub, dto);
    }
    availability(user, query) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.getProAvailability(user.companyId, query);
    }
    createBooking(user, dto) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.createProBooking(user.companyId, user.sub, dto);
    }
    settings(user) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.getProSettings(user.companyId);
    }
    updateSettings(user, dto) {
        (0, feature_flags_1.requireBookingProV1Enabled)();
        return this.bookingsService.updateProSettings(user.companyId, user.sub, dto);
    }
};
exports.BookingProController = BookingProController;
__decorate([
    (0, common_1.Get)('services'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "services", null);
__decorate([
    (0, common_1.Post)('services'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpsertBookingServiceDto]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "createService", null);
__decorate([
    (0, common_1.Get)('availability'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.BookingAvailabilityQueryDto]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "availability", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CreateBookingProDto]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "createBooking", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "settings", null);
__decorate([
    (0, common_1.Post)('settings'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpdateBookingProSettingsDto]),
    __metadata("design:returntype", void 0)
], BookingProController.prototype, "updateSettings", null);
exports.BookingProController = BookingProController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('booking'),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService])
], BookingProController);
//# sourceMappingURL=booking-pro.controller.js.map