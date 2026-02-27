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
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { SetLogoUrlDto, UpdateTenantSettingsDto } from './tenant.dto';
import { TenantService } from './tenant.service';

const LOGO_MAX_BYTES = Number(process.env.TENANT_LOGO_MAX_BYTES ?? 2 * 1024 * 1024);
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
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('settings')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.tenantService.getSettings(user.companyId);
  }

  @Put('settings')
  @Roles('OWNER', 'ADMIN')
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantService.updateSettings(user.companyId, user.sub, user.role, dto);
  }

  @Patch('settings')
  @Roles('OWNER', 'ADMIN')
  patchSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateTenantSettingsDto) {
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
      return this.tenantService.saveUploadedLogo(user.companyId, user.sub, file.filename);
    }

    if (dto.logoUrl) {
      return this.tenantService.setLogoUrl(user.companyId, user.sub, dto.logoUrl);
    }

    throw new BadRequestException('Provide a valid logo URL or file');
  }
}
