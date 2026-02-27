import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto, LoginDto, ResendVerificationDto, ResetPasswordDto, SignupDto, VerifyEmailDto } from './dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly audit;
    constructor(prisma: PrismaService, jwt: JwtService, audit: AuditService);
    private tokenHash;
    private makeToken;
    private waitLine;
    private sendSmtpCommand;
    private sendViaSmtp;
    private sendOrLogEmail;
    private createEmailVerificationToken;
    signup(dto: SignupDto): Promise<{
        token: string;
        user: {
            id: any;
            companyId: any;
            email: any;
            emailVerified: boolean;
            role: any;
            createdAt: any;
        };
        company: {
            id: any;
            name: any;
            timezone: any;
            currency: any;
        };
        emailVerificationRequired: boolean;
    }>;
    login(dto: LoginDto): Promise<{
        token: string;
        user: {
            id: any;
            companyId: any;
            email: any;
            emailVerified: boolean;
            role: any;
            createdAt: any;
            lastLoginAt: string;
        };
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        ok: boolean;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        ok: boolean;
    }>;
    verifyEmail(dto: VerifyEmailDto): Promise<{
        ok: boolean;
    }>;
    resendVerificationForUser(companyId: string, userId: string, dto?: ResendVerificationDto): Promise<{
        ok: boolean;
        alreadyVerified?: undefined;
    } | {
        ok: boolean;
        alreadyVerified: boolean;
    }>;
    signOutAll(companyId: string, userId: string): Promise<{
        ok: boolean;
    }>;
}
