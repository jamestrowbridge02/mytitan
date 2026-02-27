import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { isMarketplaceEnabled, requireMarketplaceEnabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveJobDto, DeclineJobDto, SignJobDto } from './public.dto';

@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billingService: BillingService,
  ) {}

  private async resolveToken(token: string) {
    const db = this.prisma as any;
    const record = await db.publicJobToken.findUnique({
      where: { token },
      include: { job: { include: { media: true } } },
    });
    if (!record) {
      throw new NotFoundException('Token not found');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Token expired');
    }
    return record;
  }

  @Get('job/:token')
  async getJob(@Param('token') token: string) {
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
    const paymentsEnabled = Boolean(settings?.paymentsEnabled);
    const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
    const stripeReady = this.billingService.isStripeConfigured();

    await this.audit.log(record.job.companyId, 'portal.view', `Portal view for job ${record.job.jobRef}`, null);

    return {
      job: {
        id: record.job.id,
        jobRef: record.job.jobRef,
        status: record.job.status,
        customerName: record.job.customerName,
        customerEmail: record.job.customerEmail,
        customerPhone: record.job.customerPhone,
        vehicleMake: record.job.vehicleMake,
        vehicleModel: record.job.vehicleModel,
        vehicleReg: record.job.vehicleReg,
        serviceName: record.job.serviceName,
        subtotalCents: record.job.subtotalCents,
        taxCents: record.job.taxCents,
        totalCents: record.job.totalCents,
        currency: record.job.currency,
        invoicePdfUrl: record.job.invoicePdfUrl,
        paymentLinkUrl: paymentsEnabled ? record.job.paymentLinkUrl : null,
        approvedAt: record.job.approvedAt,
        signedAt: record.job.signedAt,
        signatureName: record.job.signatureName,
        signatureDataUrl: record.job.signatureDataUrl,
        declinedAt: record.job.declinedAt,
        declinedReason: record.job.declinedReason,
        paymentReceiptUrl: record.job.paymentReceiptUrl,
      },
      media: record.job.media,
      portal: {
        enabled: portalEnabled,
        paymentsEnabled,
        stripeConfigured: stripeReady,
        featureFlag: isMarketplaceEnabled(),
      },
    };
  }

  @Post('job/:token/approve')
  async approve(@Param('token') token: string, @Body() dto: ApproveJobDto) {
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const updated = await db.job.update({
      where: { id: record.jobId },
      data: {
        approvedAt: new Date(),
        approvedByName: dto.name ?? null,
        declinedAt: null,
        declinedReason: null,
      },
    });
    await this.audit.log(record.job.companyId, 'portal.approve', `Job ${record.job.jobRef} approved`, null);
    return { approvedAt: updated.approvedAt };
  }

  @Post('job/:token/decline')
  async decline(@Param('token') token: string, @Body() dto: DeclineJobDto) {
    requireMarketplaceEnabled();
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const updated = await db.job.update({
      where: { id: record.jobId },
      data: {
        declinedAt: new Date(),
        declinedReason: dto.reason ?? null,
        approvedAt: null,
      },
    });
    await this.audit.log(record.job.companyId, 'portal.decline', `Job ${record.job.jobRef} declined`, null);
    return { declinedAt: updated.declinedAt };
  }

  @Post('job/:token/sign')
  async sign(@Param('token') token: string, @Body() dto: SignJobDto) {
    const record = await this.resolveToken(token);
    if (dto.signatureDataUrl && !dto.signatureDataUrl.startsWith('data:image')) {
      throw new BadRequestException('Invalid signature data');
    }
    if (dto.signatureDataUrl && dto.signatureDataUrl.length > 200_000) {
      throw new BadRequestException('Signature data too large');
    }
    const db = this.prisma as any;
    const updated = await db.job.update({
      where: { id: record.jobId },
      data: {
        signedAt: new Date(),
        signatureName: dto.name ?? null,
        signatureDataUrl: dto.signatureDataUrl ?? null,
      },
    });
    await this.audit.log(record.job.companyId, 'portal.sign', `Signature captured for job ${record.job.jobRef}`, null);
    return { signedAt: updated.signedAt };
  }

  @Post('job/:token/checkout')
  async checkout(@Param('token') token: string) {
    requireMarketplaceEnabled();
    const record = await this.resolveToken(token);
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: record.job.companyId } });
    const portalEnabled = Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled);
    if (!portalEnabled) {
      throw new BadRequestException('Customer portal is not enabled for this tenant');
    }
    if (!settings?.paymentsEnabled) {
      throw new BadRequestException('Payments not configured for this tenant');
    }
    if (!this.billingService.isStripeConfigured()) {
      throw new ServiceUnavailableException('Payments are not configured');
    }

    return this.billingService.createJobPaymentSession(record.job.companyId, record.jobId, token);
  }

  @Get('job/:token/payment-status')
  async paymentStatus(@Param('token') token: string, @Query('session_id') sessionId?: string) {
    requireMarketplaceEnabled();
    if (!sessionId) {
      throw new BadRequestException('Missing session_id');
    }
    if (!this.billingService.isStripeConfigured()) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const record = await this.resolveToken(token);
    return this.billingService.getJobPaymentStatus(record.job.companyId, record.jobId, sessionId);
  }
}
