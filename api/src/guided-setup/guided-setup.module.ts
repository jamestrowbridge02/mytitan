import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantModule } from "../tenant/tenant.module";
import { TemplatesModule } from "../templates/templates.module";
import { TradePacksModule } from "../trade-packs/trade-packs.module";
import { GuidedSetupController } from "./guided-setup.controller";
import { GuidedSetupService } from "./guided-setup.service";

@Module({
  imports: [PrismaModule, AuditModule, TenantModule, TradePacksModule, BillingModule, TemplatesModule],
  controllers: [GuidedSetupController],
  providers: [GuidedSetupService],
})
export class GuidedSetupModule {}
