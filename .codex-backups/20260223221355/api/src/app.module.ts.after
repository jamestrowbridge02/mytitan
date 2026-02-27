import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { MeModule } from './me/me.module';
import { MetricsModule } from './metrics/metrics.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { RedisModule } from './redis/redis.module';
import { TenantModule } from './tenant/tenant.module';
import { TradeAccountsModule } from './trade-accounts/trade-accounts.module';
import { TradePacksModule } from './trade-packs/trade-packs.module';
import { TemplatesModule } from './templates/templates.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
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
    TenantModule,
    CatalogModule,
    EmailTemplatesModule,
    AiModule,
    BillingModule,
    JobsModule,
    BookingsModule,
    TradeAccountsModule,
    TradePacksModule,
    TemplatesModule,
    OnboardingModule,
    UsersModule,
    UsageModule,
    PublicModule,
  ],
})
export class AppModule {}
