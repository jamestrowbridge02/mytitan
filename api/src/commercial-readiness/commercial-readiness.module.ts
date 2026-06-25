import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import {
  CommercialReadinessPlatformController,
  CommercialReadinessPublicController,
  MarketingReviewsController,
} from './commercial-readiness.controller';
import { CommercialReadinessService } from './commercial-readiness.service';

@Module({
  imports: [EmailModule],
  controllers: [
    CommercialReadinessPublicController,
    MarketingReviewsController,
    CommercialReadinessPlatformController,
  ],
  providers: [CommercialReadinessService],
})
export class CommercialReadinessModule {}
