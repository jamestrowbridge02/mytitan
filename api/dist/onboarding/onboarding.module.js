"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingModule = void 0;
const common_1 = require("@nestjs/common");
const audit_module_1 = require("../audit/audit.module");
const prisma_module_1 = require("../prisma/prisma.module");
const tenant_module_1 = require("../tenant/tenant.module");
const trade_packs_module_1 = require("../trade-packs/trade-packs.module");
const onboarding_controller_1 = require("./onboarding.controller");
const onboarding_service_1 = require("./onboarding.service");
let OnboardingModule = class OnboardingModule {
};
exports.OnboardingModule = OnboardingModule;
exports.OnboardingModule = OnboardingModule = __decorate([
    (0, common_1.Module)({
        imports: [tenant_module_1.TenantModule, prisma_module_1.PrismaModule, audit_module_1.AuditModule, trade_packs_module_1.TradePacksModule],
        controllers: [onboarding_controller_1.OnboardingController, onboarding_controller_1.SetupController, onboarding_controller_1.IntegrationsController],
        providers: [onboarding_service_1.OnboardingService],
    })
], OnboardingModule);
//# sourceMappingURL=onboarding.module.js.map