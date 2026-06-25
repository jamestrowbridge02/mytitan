import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ModerateMarketingReviewDto,
  SubmitBespokeEnquiryDto,
  SubmitMarketingReviewDto,
  UpdateBespokeEnquiryDto,
} from './commercial-readiness.dto';

@Injectable()
export class CommercialReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  private plainText(value: unknown, field: string, maxLength: number) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (/[<>]/.test(normalized)) {
      throw new BadRequestException(`${field} must be plain text without HTML.`);
    }
    return normalized.slice(0, maxLength);
  }

  private normalizeEmail(value: unknown) {
    return String(value || '').trim().toLowerCase().slice(0, 254);
  }

  async createBespokeEnquiry(dto: SubmitBespokeEnquiryDto, requestFingerprint: string) {
    if (!dto.consentToContact) {
      throw new BadRequestException('Consent to contact is required.');
    }
    if (dto.website) {
      return { ok: true, message: 'Your enquiry has been received.' };
    }

    const db = this.prisma as any;
    const enquiry = await db.bespokeAccountEnquiry.create({
      data: {
        businessName: this.plainText(dto.businessName, 'Business name', 160),
        contactName: this.plainText(dto.contactName, 'Contact name', 120),
        email: this.normalizeEmail(dto.email),
        phone: dto.phone ? this.plainText(dto.phone, 'Phone', 40) : null,
        estimatedMonthlyJobs: dto.estimatedMonthlyJobs,
        locationsCount: dto.locationsCount,
        message: this.plainText(dto.message, 'Message', 4000),
        consentToContact: true,
        requestFingerprint,
      },
    });

    const recipient = String(process.env.SUPPORT_EMAIL || 'support@mytitan.co.uk').trim().toLowerCase();
    const delivery = await this.email.sendSystemOperationalEmail({
      to: recipient,
      subject: `[MyTitan Bespoke Account] ${enquiry.businessName}`,
      text: [
        `Enquiry: ${enquiry.id}`,
        `Business: ${enquiry.businessName}`,
        `Contact: ${enquiry.contactName}`,
        `Email: ${enquiry.email}`,
        `Phone: ${enquiry.phone || 'Not provided'}`,
        `Estimated monthly jobs: ${enquiry.estimatedMonthlyJobs}`,
        `Locations or branches: ${enquiry.locationsCount}`,
        '',
        enquiry.message,
      ].join('\n'),
      replyToEmail: enquiry.email,
    }, {
      category: 'bespoke_account_enquiry',
      templateKey: 'bespoke_account_enquiry',
    });

    await db.bespokeAccountEnquiry.update({
      where: { id: enquiry.id },
      data: { emailDeliveryStatus: delivery.status },
    });

    return {
      ok: true,
      id: enquiry.id,
      message: 'Your bespoke account enquiry has been recorded for the MyTitan team.',
    };
  }

  async submitReview(tenantId: string, userId: string, dto: SubmitMarketingReviewDto) {
    if (!dto.consentToPublish) {
      throw new BadRequestException('Consent to publish is required before submitting a review.');
    }
    const db = this.prisma as any;
    const review = await db.marketingReview.create({
      data: {
        tenantId,
        submittedByUserId: userId,
        rating: dto.rating,
        quote: this.plainText(dto.quote, 'Review', 500),
        businessName: this.plainText(dto.businessName, 'Business name', 160),
        reviewerName: dto.reviewerName ? this.plainText(dto.reviewerName, 'Reviewer name', 120) : null,
        reviewerTitle: dto.reviewerTitle ? this.plainText(dto.reviewerTitle, 'Reviewer title', 120) : null,
        consentToPublish: true,
      },
      select: {
        id: true,
        rating: true,
        quote: true,
        businessName: true,
        reviewerName: true,
        reviewerTitle: true,
        status: true,
        createdAt: true,
      },
    });
    await this.audit.log(tenantId, 'marketing_review.submitted', `Marketing review ${review.id} submitted for moderation`, userId);
    return review;
  }

  async listTenantReviews(tenantId: string) {
    const db = this.prisma as any;
    return db.marketingReview.findMany({
      where: { tenantId },
      select: {
        id: true,
        rating: true,
        quote: true,
        businessName: true,
        reviewerName: true,
        reviewerTitle: true,
        status: true,
        moderationNote: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listApprovedReviews() {
    const db = this.prisma as any;
    const reviews = await db.marketingReview.findMany({
      where: { status: 'APPROVED', consentToPublish: true },
      select: {
        id: true,
        rating: true,
        quote: true,
        businessName: true,
        reviewerName: true,
        reviewerTitle: true,
        displayQuote: true,
        displayBusinessName: true,
        displayReviewerName: true,
        displayReviewerTitle: true,
        pinned: true,
        sortOrder: true,
      },
      orderBy: [{ pinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 12,
    });
    return reviews.map((review: any) => ({
      id: review.id,
      rating: review.rating,
      quote: review.displayQuote || review.quote,
      businessName: review.displayBusinessName || review.businessName,
      reviewerName: review.displayReviewerName ?? review.reviewerName ?? null,
      reviewerTitle: review.displayReviewerTitle ?? review.reviewerTitle ?? null,
    }));
  }

  async listPlatformReviews(status?: string) {
    const db = this.prisma as any;
    const normalized = String(status || '').toUpperCase();
    const allowed = ['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'];
    return db.marketingReview.findMany({
      where: allowed.includes(normalized) ? { status: normalized } : undefined,
      include: {
        tenant: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async moderateReview(id: string, actorUserId: string, dto: ModerateMarketingReviewDto) {
    const db = this.prisma as any;
    const existing = await db.marketingReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found.');
    if (dto.status === 'APPROVED' && !existing.consentToPublish) {
      throw new BadRequestException('A review without publication consent cannot be approved.');
    }
    const updated = await db.marketingReview.update({
      where: { id },
      data: {
        status: dto.status,
        displayQuote: dto.displayQuote === undefined ? existing.displayQuote : this.plainText(dto.displayQuote, 'Display review', 500),
        displayBusinessName: dto.displayBusinessName === undefined
          ? existing.displayBusinessName
          : this.plainText(dto.displayBusinessName, 'Display business name', 160),
        displayReviewerName: dto.displayReviewerName === undefined
          ? existing.displayReviewerName
          : this.plainText(dto.displayReviewerName, 'Display reviewer name', 120),
        displayReviewerTitle: dto.displayReviewerTitle === undefined
          ? existing.displayReviewerTitle
          : this.plainText(dto.displayReviewerTitle, 'Display reviewer title', 120),
        pinned: dto.pinned ?? existing.pinned,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        moderationNote: dto.moderationNote === undefined
          ? existing.moderationNote
          : this.plainText(dto.moderationNote, 'Moderation note', 500),
        moderatedByUserId: actorUserId,
        moderatedAt: new Date(),
      },
    });
    await this.audit.log(
      existing.tenantId,
      `marketing_review.${dto.status.toLowerCase()}`,
      `Marketing review ${id} changed from ${existing.status} to ${dto.status}`,
      actorUserId,
    );
    return updated;
  }

  async listBespokeEnquiries(status?: string) {
    const db = this.prisma as any;
    const normalized = String(status || '').toUpperCase();
    const allowed = ['NEW', 'CONTACTED', 'CLOSED', 'ARCHIVED'];
    return db.bespokeAccountEnquiry.findMany({
      where: allowed.includes(normalized) ? { status: normalized } : undefined,
      select: {
        id: true,
        businessName: true,
        contactName: true,
        email: true,
        phone: true,
        estimatedMonthlyJobs: true,
        locationsCount: true,
        message: true,
        consentToContact: true,
        status: true,
        emailDeliveryStatus: true,
        handledByUserId: true,
        handledAt: true,
        internalNote: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async updateBespokeEnquiry(id: string, actorUserId: string, dto: UpdateBespokeEnquiryDto) {
    const db = this.prisma as any;
    const existing = await db.bespokeAccountEnquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Enquiry not found.');
    return db.bespokeAccountEnquiry.update({
      where: { id },
      data: {
        status: dto.status,
        internalNote: dto.internalNote === undefined
          ? existing.internalNote
          : this.plainText(dto.internalNote, 'Internal note', 1000),
        handledByUserId: actorUserId,
        handledAt: new Date(),
      },
    });
  }
}
