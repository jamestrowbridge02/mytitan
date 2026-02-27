"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const ai_module_1 = require("./ai/ai.module");
const auth_module_1 = require("./auth/auth.module");
const audit_module_1 = require("./audit/audit.module");
const billing_module_1 = require("./billing/billing.module");
const bookings_module_1 = require("./bookings/bookings.module");
const calendar_module_1 = require("./calendar/calendar.module");
const catalog_module_1 = require("./catalog/catalog.module");
const email_templates_module_1 = require("./email-templates/email-templates.module");
const health_module_1 = require("./health/health.module");
const integrations_module_1 = require("./integrations/integrations.module");
const jobs_module_1 = require("./jobs/jobs.module");
const me_module_1 = require("./me/me.module");
const metrics_module_1 = require("./metrics/metrics.module");
const command_centre_module_1 = require("./command-centre/command-centre.module");
const locations_module_1 = require("./locations/locations.module");
const onboarding_module_1 = require("./onboarding/onboarding.module");
const guided_setup_module_1 = require("./guided-setup/guided-setup.module");
const prisma_module_1 = require("./prisma/prisma.module");
const public_module_1 = require("./public/public.module");
const pricing_presets_module_1 = require("./pricing-presets/pricing-presets.module");
const redis_module_1 = require("./redis/redis.module");
const tenant_module_1 = require("./tenant/tenant.module");
const trade_accounts_module_1 = require("./trade-accounts/trade-accounts.module");
const trade_packs_module_1 = require("./trade-packs/trade-packs.module");
const templates_module_1 = require("./templates/templates.module");
const usage_module_1 = require("./usage/usage.module");
const users_module_1 = require("./users/users.module");
const drafts_module_1 = require("./drafts/drafts.module");
const inventory_module_1 = require("./inventory/inventory.module");
const notifications_module_1 = require("./notifications/notifications.module");
const automations_module_1 = require("./automations/automations.module");
const analytics_module_1 = require("./analytics/analytics.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            jwt_1.JwtModule.registerAsync({
                global: true,
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET', 'dev_insecure'),
                    signOptions: { expiresIn: '7d' },
                }),
            }),
            prisma_module_1.PrismaModule,
            audit_module_1.AuditModule,
            redis_module_1.RedisModule,
            health_module_1.HealthModule,
            integrations_module_1.IntegrationsModule,
            auth_module_1.AuthModule,
            me_module_1.MeModule,
            metrics_module_1.MetricsModule,
            command_centre_module_1.CommandCentreModule,
            locations_module_1.LocationsModule,
            tenant_module_1.TenantModule,
            catalog_module_1.CatalogModule,
            email_templates_module_1.EmailTemplatesModule,
            ai_module_1.AiModule,
            billing_module_1.BillingModule,
            jobs_module_1.JobsModule,
            bookings_module_1.BookingsModule,
            calendar_module_1.CalendarModule,
            trade_accounts_module_1.TradeAccountsModule,
            trade_packs_module_1.TradePacksModule,
            templates_module_1.TemplatesModule,
            onboarding_module_1.OnboardingModule,
            guided_setup_module_1.GuidedSetupModule,
            users_module_1.UsersModule,
            drafts_module_1.DraftsModule,
            inventory_module_1.InventoryModule,
            notifications_module_1.NotificationsModule,
            automations_module_1.AutomationsModule,
            analytics_module_1.AnalyticsModule,
            usage_module_1.UsageModule,
            public_module_1.PublicModule,
            pricing_presets_module_1.PricingPresetsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map