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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutSessionDto = void 0;
const class_validator_1 = require("class-validator");
const billing_constants_1 = require("./billing.constants");
const PLAN_CODES = Object.keys(billing_constants_1.PLAN_DEFINITIONS);
const INTERVALS = ['MONTHLY', 'ANNUAL'];
class CheckoutSessionDto {
}
exports.CheckoutSessionDto = CheckoutSessionDto;
__decorate([
    (0, class_validator_1.IsIn)(PLAN_CODES),
    __metadata("design:type", String)
], CheckoutSessionDto.prototype, "planCode", void 0);
__decorate([
    (0, class_validator_1.IsIn)(INTERVALS),
    __metadata("design:type", String)
], CheckoutSessionDto.prototype, "interval", void 0);
//# sourceMappingURL=billing.dto.js.map