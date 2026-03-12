import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { EventsModule } from "../events/events.module";
import { JobsModule } from "../jobs/jobs.module";
import { RevenueModule } from "../revenue/revenue.module";
import { ServicePlansModule } from "../service-plans/service-plans.module";
import { CustomerAccountsController } from "./customer-accounts.controller";
import { CustomerApprovalsController } from "./customer-approvals.controller";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerJwtStrategy } from "./customer-jwt.strategy";
import { CustomerServicePlansController } from "./customer-service-plans.controller";
import { CustomerWorkspaceController } from "./customer-workspace.controller";
import { CustomerJwtAuthGuard } from "./customer-auth.guard";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@Module({
  imports: [PassportModule, EventsModule, ServicePlansModule, RevenueModule, JobsModule],
  controllers: [
    CustomerAuthController,
    CustomerAccountsController,
    CustomerApprovalsController,
    CustomerServicePlansController,
    CustomerWorkspaceController,
  ],
  providers: [CustomerWorkspaceService, CustomerJwtStrategy, CustomerJwtAuthGuard],
  exports: [CustomerWorkspaceService],
})
export class CustomerWorkspaceModule {}
