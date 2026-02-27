import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
export declare class FeatureGuard implements CanActivate {
    private readonly reflector;
    private readonly prisma;
    private readonly tenantService;
    constructor(reflector: Reflector, prisma: PrismaService, tenantService: TenantService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
