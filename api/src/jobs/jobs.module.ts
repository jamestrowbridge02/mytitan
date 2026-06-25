import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AutomationsModule } from "../automations/automations.module";
import { BillingModule } from "../billing/billing.module";
import { DocumentControlModule } from "../document-control/document-control.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { EventsModule } from "../events/events.module";
import { EnterpriseModule } from "../enterprise/enterprise.module";
import { EmailModule } from "../email/email.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TemplatesModule } from "../templates/templates.module";
import { JobCompletionLinkService } from "./job-completion-link.service";
import { CustomerJourneyService } from "./customer-journey.service";
import { JobExecutionService } from "./job-execution.service";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AuditModule, TemplatesModule, NotificationsModule, AutomationsModule, EventsModule, EnterpriseModule, InventoryModule, ComplianceModule, BillingModule, EmailModule, DocumentControlModule],
  controllers: [JobsController],
  providers: [JobsService, JobExecutionService, JobCompletionLinkService, CustomerJourneyService],
  exports: [JobsService, JobExecutionService, JobCompletionLinkService, CustomerJourneyService],
})
export class JobsModule {}
