"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuidedSetupModule = void 0;
const common_1 = require("@nestjs/common");
const billing_module_1 = require("../billing/billing.module");
const audit_module_1 = require("../audit/audit.module");
const prisma_module_1 = require("../prisma/prisma.module");
const tenant_module_1 = require("../tenant/tenant.module");
const trade_packs_module_1 = require("../trade-packs/trade-packs.module");
const guided_setup_controller_1 = require("./guided-setup.controller");
const guided_setup_service_1 = require("./guided-setup.service");
let GuidedSetupModule = class GuidedSetupModule {
};
exports.GuidedSetupModule = GuidedSetupModule;
exports.GuidedSetupModule = GuidedSetupModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, audit_module_1.AuditModule, tenant_module_1.TenantModule, trade_packs_module_1.TradePacksModule, billing_module_1.BillingModule],
        controllers: [guided_setup_controller_1.GuidedSetupController],
        providers: [guided_setup_service_1.GuidedSetupService],
    })
], GuidedSetupModule);
//# sourceMappingURL=guided-setup.module.js.map