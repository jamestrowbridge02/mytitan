import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Param,
  Post,
  Put,
  Res,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { EmailService } from '../email/email.service';
import { type InternalMonitoringAction } from '../common/internal-monitoring';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { SetLogoUrlDto, UpdateTenantSettingsDto } from './tenant.dto';
import { TenantService } from './tenant.service';
import { assertUploadAllowed, UPLOAD_LIMITS } from '../common/upload-policy';
import { bookingMediaPath, safeBookingMediaSegment } from '../common/tenant-booking-media';

const LOGO_MAX_BYTES = Number(process.env.TENANT_LOGO_MAX_BYTES ?? UPLOAD_LIMITS.logo);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

@Controller('tenant')
export class TenantPublicAssetsController {
  @Get('public-logo/:tenantId/:fileName')
  async getPublicLogo(
    @Param('tenantId') tenantId: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const safeTenantId = safeFileName(tenantId);
    const safeName = safeFileName(fileName);
    const filePath = join(process.cwd(), 'uploads', 'tenants', safeTenantId, safeName);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Logo not found');
    }
    return res.sendFile(filePath);
  }

  @Get('public-booking-media/:tenantId/:fileName')
  async getPublicBookingMedia(
    @Param('tenantId') tenantId: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const filePath = bookingMediaPath(safeBookingMediaSegment(tenantId), safeBookingMediaSegment(fileName));
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Booking image not found');
    }
    return res.sendFile(filePath);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly emailService: EmailService,
  ) {}

  private assertMonitoringAccess(user: JwtPayload) {
    if (user?.platformAdmin || user?.role === 'OWNER' || user?.role === 'ADMIN') {
      return;
    }
    throw new ForbiddenException('Only owners, admins, and platform admins can view monitoring.');
  }

  private assertPlatformMonitoringAccess(user: JwtPayload) {
    if (user?.platformAdmin) return;
    throw new ForbiddenException('Platform admin access required');
  }

  @Get('settings')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.tenantService.getSettings(user.companyId);
  }

  @Get('settings/email-readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getEmailReadiness(@CurrentUser() user: JwtPayload, @Query('ownership') ownership?: string) {
    const scope = ownership === 'system' ? 'system' : 'workspace';
    if (scope === 'system') {
      return this.emailService.getReadiness(null, { probe: true, ownership: 'system' });
    }
    return this.emailService.getOperationalReadiness(user.companyId, { probe: true });
  }

  @Get('settings/operations-readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getOperationsReadiness(@CurrentUser() user: JwtPayload) {
    this.assertMonitoringAccess(user);
    return this.tenantService.getOperationsReadiness(user.companyId);
  }

  @Get('account-health')
  @Roles('OWNER', 'ADMIN')
  async getAccountHealth(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'tenant.account_health.read' });
    return this.tenantService.getAccountHealth(user.companyId);
  }

  @Post('account-health/:key/fix')
  @Roles('OWNER', 'ADMIN')
  async fixAccountHealth(@CurrentUser() user: JwtPayload, @Param('key') key: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'tenant.account_health.fix' });
    return this.tenantService.applyAccountHealthFix(user.companyId, user.sub, key);
  }

  @Get('settings/internal-monitoring')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getInternalMonitoring(@CurrentUser() user: JwtPayload) {
    this.assertPlatformMonitoringAccess(user);
    return this.tenantService.getInternalMonitoring(user.companyId);
  }

  @Post('settings/internal-monitoring/actions')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async runInternalMonitoringAction(@CurrentUser() user: JwtPayload, @Body('action') action?: string) {
    this.assertPlatformMonitoringAccess(user);
    const normalizedAction = String(action || '').trim() as InternalMonitoringAction;
    const allowedActions = new Set<InternalMonitoringAction>([
      'refresh_snapshot',
      'run_health_check',
      'verify_notification_routing',
      'check_billing_readiness',
      'validate_backups',
    ]);
    if (!allowedActions.has(normalizedAction)) {
      throw new BadRequestException('Unsupported monitoring action');
    }
    return this.tenantService.runInternalMonitoringAction(user.companyId, normalizedAction);
  }

  @Put('settings')
  @Roles('OWNER', 'ADMIN')
  async updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateTenantSettingsDto) {
    await assertPermission({ user, permission: 'settings.manage', action: 'tenant.settings.update' });
    return this.tenantService.updateSettings(user.companyId, user.sub, user.role, dto);
  }

  @Patch('settings')
  @Roles('OWNER', 'ADMIN')
  async patchSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateTenantSettingsDto) {
    await assertPermission({ user, permission: 'settings.manage', action: 'tenant.settings.patch' });
    return this.tenantService.updateSettings(user.companyId, user.sub, user.role, dto);
  }

  @Post('settings/logo')
  @Roles('OWNER', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (req: any, file, cb) => {
          try {
            const user = req.user as JwtPayload;
            const dir = join(process.cwd(), 'uploads', 'tenants', safeFileName(user.companyId));
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
          } catch (error: any) {
            cb(error, '');
          }
        },
        filename: (req, file, cb) => {
          const suffix = `${Date.now()}${extname(file.originalname || '') || '.png'}`;
          cb(null, `logo-${safeFileName(suffix)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(new ForbiddenException('Unsupported file type'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: LOGO_MAX_BYTES,
      },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body() dto: SetLogoUrlDto,
  ) {
    if (file) {
      const policy = assertUploadAllowed(file);
      if (policy.category !== 'image' || file.size > LOGO_MAX_BYTES) {
        await fs.unlink(file.path).catch(() => undefined);
        throw new BadRequestException(`This file is too large. Maximum allowed is ${Math.round(LOGO_MAX_BYTES / 1024 / 1024)} MB for a logo.`);
      }
      return this.tenantService.saveUploadedLogo(user.companyId, user.sub, file.filename);
    }

    if (dto.logoUrl) {
      return this.tenantService.setLogoUrl(user.companyId, user.sub, dto.logoUrl);
    }

    throw new BadRequestException('Provide a valid logo URL or file');
  }
}
