import { Role } from '../common/constants';

export interface JwtPayload {
  sub: string;
  companyId: string;
  role: Role;
  email: string;
  tokenVersion?: number;
  emailVerified?: boolean;
  demoUser?: boolean;
}
