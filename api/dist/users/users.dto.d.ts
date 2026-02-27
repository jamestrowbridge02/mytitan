import { ROLES } from '../common/constants';
export declare class InviteUserDto {
    email: string;
    role: (typeof ROLES)[number];
}
export declare class AcceptInviteDto {
    token: string;
    password: string;
}
export declare class UpdateUserRoleDto {
    role: (typeof ROLES)[number];
}
