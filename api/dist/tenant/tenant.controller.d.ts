import type { Response } from 'express';
import { JwtPayload } from '../auth/auth.types';
import { SetLogoUrlDto, UpdateTenantSettingsDto } from './tenant.dto';
import { TenantService } from './tenant.service';
export declare class TenantPublicAssetsController {
    getPublicLogo(tenantId: string, fileName: string, res: Response): Promise<void>;
}
export declare class TenantController {
    private readonly tenantService;
    constructor(tenantService: TenantService);
    getSettings(user: JwtPayload): Promise<any>;
    updateSettings(user: JwtPayload, dto: UpdateTenantSettingsDto): Promise<any>;
    patchSettings(user: JwtPayload, dto: UpdateTenantSettingsDto): Promise<any>;
    uploadLogo(user: JwtPayload, file: any, dto: SetLogoUrlDto): Promise<{
        logoUrl: any;
    }>;
}
