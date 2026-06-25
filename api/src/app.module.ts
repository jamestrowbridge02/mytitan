import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { BookingsModule } from './bookings/bookings.module';
import { CalendarModule } from './calendar/calendar.module';
import { CatalogModule } from './catalog/catalog.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { MeModule } from './me/me.module';
import { MetricsModule } from './metrics/metrics.module';
import { CommandCentreModule } from './command-centre/command-centre.module';
import { LocationsModule } from './locations/locations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { GuidedSetupModule } from './guided-setup/guided-setup.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { PortalModule } from './portal/portal.module';
import { PricingPresetsModule } from './pricing-presets/pricing-presets.module';
import { RedisModule } from './redis/redis.module';
import { TenantModule } from './tenant/tenant.module';
import { TradeAccountsModule } from './trade-accounts/trade-accounts.module';
import { TradePacksModule } from './trade-packs/trade-packs.module';
import { TemplatesModule } from './templates/templates.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';
import { DraftsModule } from './drafts/drafts.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AutomationsModule } from './automations/automations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';
import { CustomersModule } from './customers/customers.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { TechModule } from './tech/tech.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { ServicePlansModule } from './service-plans/service-plans.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CustomerWorkspaceModule } from './customer-workspace/customer-workspace.module';
import { RevenueModule } from './revenue/revenue.module';
import { ComplianceModule } from './compliance/compliance.module';
import { PerformanceModule } from './performance/performance.module';
import { CompensationModule } from './compensation/compensation.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { Phase6BModule } from './phase6b/phase6b.module';
import { CommercialReadinessModule } from './commercial-readiness/commercial-readiness.module';
import { DocumentControlModule } from './document-control/document-control.module';

@Module({
  imports: [
    EventsModule,
    ThrottlerModule.forRoot([{ ttl: 60, limit: 120 }]),
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev_insecure'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    PrismaModule,
    AuditModule,
    RedisModule,
    HealthModule,
    IntegrationsModule,
    AuthModule,
    MeModule,
    MetricsModule,
    CommandCentreModule,
    LocationsModule,
    TenantModule,
    CatalogModule,
    EmailTemplatesModule,
    AiModule,
    BillingModule,
    JobsModule,
    BookingsModule,
    CalendarModule,
    TradeAccountsModule,
    TradePacksModule,
    TemplatesModule,
    OnboardingModule,
    GuidedSetupModule,
    UsersModule,
    DraftsModule,
    InventoryModule,
    NotificationsModule,
    AutomationsModule,
    AnalyticsModule,
    UsageModule,
    PublicModule,
    PortalModule,
    PricingPresetsModule,
    AdminModule,
    CustomersModule,
    CustomFieldsModule,
    TechModule,
    ArtifactsModule,
    ServicePlansModule,
    ScheduleModule,
    CustomerWorkspaceModule,
    RevenueModule,
    ComplianceModule,
    PerformanceModule,
    CompensationModule,
    EnterpriseModule,
    Phase6BModule,
    CommercialReadinessModule,
    DocumentControlModule,
  ],
})
export class AppModule {}
