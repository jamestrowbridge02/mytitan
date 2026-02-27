import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
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
