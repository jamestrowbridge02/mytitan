export declare class SignupDto {
    companyName: string;
    timezone?: string;
    currency?: string;
    email: string;
    password: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class ForgotPasswordDto {
    email: string;
}
export declare class ResetPasswordDto {
    token: string;
    newPassword: string;
}
export declare class VerifyEmailDto {
    token: string;
}
export declare class ResendVerificationDto {
    email?: string;
}
