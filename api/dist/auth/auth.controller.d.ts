import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from './auth.types';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResendVerificationDto, ResetPasswordDto, SignupDto, VerifyEmailDto } from './dto';
export declare class AuthController {
    private readonly auth;
    private readonly audit;
    private readonly buckets;
    private readonly maxRequests;
    private readonly windowMs;
    constructor(auth: AuthService, audit: AuditService);
    private enforceRateLimit;
    signup(req: Request, dto: SignupDto): Promise<{
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
    login(req: Request, dto: LoginDto): Promise<{
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
    forgotPassword(req: Request, dto: ForgotPasswordDto): Promise<{
        ok: boolean;
    }>;
    resetPassword(req: Request, dto: ResetPasswordDto): Promise<{
        ok: boolean;
    }>;
    verifyEmail(req: Request, dto: VerifyEmailDto): Promise<{
        ok: boolean;
    }>;
    resendVerification(req: Request, user: JwtPayload, dto: ResendVerificationDto): Promise<{
        ok: boolean;
        alreadyVerified?: undefined;
    } | {
        ok: boolean;
        alreadyVerified: boolean;
    }>;
    logout(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
    logoutAll(user: JwtPayload): Promise<{
        ok: boolean;
    }>;
}
