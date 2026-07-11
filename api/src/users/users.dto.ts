import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLES } from '../common/constants';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateUserRoleDto {
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}

export class UpdateUserWorkforceDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  seniority?: string;

  @IsOptional()
  @IsString()
  employeeReference?: string;

  @IsOptional()
  @IsString()
  permissionProfile?: string;

  @IsOptional()
  @IsBoolean()
  isStaffMember?: boolean;

  @IsOptional()
  @IsBoolean()
  isSchedulable?: boolean;

  @IsOptional()
  @IsBoolean()
  isAssignable?: boolean;

  @IsOptional()
  @IsBoolean()
  appearsOnRota?: boolean;

  @IsOptional()
  @IsBoolean()
  appearsInBookingAssignment?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublicBookable?: boolean;

  @IsOptional()
  @IsIn(['EMPLOYEE', 'CONTRACTOR', 'GUEST'])
  workforceAccessType?: 'EMPLOYEE' | 'CONTRACTOR' | 'GUEST';
}
