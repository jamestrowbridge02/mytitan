import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';
export declare class UsersService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(tenantId: string, role: string): Promise<any>;
    invite(tenantId: string, inviterId: string, dto: InviteUserDto): Promise<{
        token: any;
        expiresAt: any;
    }>;
    acceptInvite(dto: AcceptInviteDto): Promise<{
        accepted: boolean;
    }>;
    updateRole(tenantId: string, actorId: string, userId: string, dto: UpdateUserRoleDto): Promise<any>;
}
