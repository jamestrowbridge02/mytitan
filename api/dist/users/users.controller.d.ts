import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly users;
    private readonly prisma;
    private readonly audit;
    constructor(users: UsersService, prisma: PrismaService, audit: AuditService);
    private assertCanInvite;
    list(user: JwtPayload): Promise<any>;
    invite(user: JwtPayload, dto: InviteUserDto, req: {
        requestId?: string;
        headers?: Record<string, string | string[] | undefined>;
    }): Promise<{
        token: any;
        expiresAt: any;
    }>;
    updateRole(user: JwtPayload, id: string, dto: UpdateUserRoleDto, req: {
        requestId?: string;
        headers?: Record<string, string | string[] | undefined>;
    }): Promise<any>;
}
export declare class UsersPublicController {
    private readonly users;
    constructor(users: UsersService);
    acceptInvite(dto: AcceptInviteDto): Promise<{
        accepted: boolean;
    }>;
}
