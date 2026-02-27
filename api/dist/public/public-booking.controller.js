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
exports.PublicBookingController = void 0;
const common_1 = require("@nestjs/common");
const feature_flags_1 = require("../common/feature-flags");
const bookings_service_1 = require("../bookings/bookings.service");
const dto_1 = require("../bookings/dto");
let PublicBookingController = class PublicBookingController {
    constructor(bookingsService) {
        this.bookingsService = bookingsService;
    }
    async config(token) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            throw new common_1.ServiceUnavailableException('Feature is not enabled.');
        }
        return this.bookingsService.getPublicConfig(token);
    }
    async slots(token, date, serviceId, locationId) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            throw new common_1.ServiceUnavailableException('Feature is not enabled.');
        }
        if (!date || !serviceId) {
            return [];
        }
        return this.bookingsService.getAvailableSlots(token, date, serviceId, locationId);
    }
    async create(token, dto) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            throw new common_1.ServiceUnavailableException('Feature is not enabled.');
        }
        return this.bookingsService.createPublicBooking(token, dto);
    }
    async ics(token, res) {
        if (!(0, feature_flags_1.isMarketplaceEnabled)()) {
            throw new common_1.ServiceUnavailableException('Feature is not enabled.');
        }
        const ics = await this.bookingsService.getIcsFeed(token);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.send(ics);
    }
};
exports.PublicBookingController = PublicBookingController;
__decorate([
    (0, common_1.Get)('booking/:token/config'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "config", null);
__decorate([
    (0, common_1.Get)('booking/:token/slots'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Query)('serviceId')),
    __param(3, (0, common_1.Query)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "slots", null);
__decorate([
    (0, common_1.Post)('booking/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.PublicBookingRequestDto]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('ics/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "ics", null);
exports.PublicBookingController = PublicBookingController = __decorate([
    (0, common_1.Controller)('public'),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService])
], PublicBookingController);
//# sourceMappingURL=public-booking.controller.js.map