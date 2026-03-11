import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './constants';
import { roleSatisfiesRequirement } from './permissions';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role } | undefined;
    if (!user?.role) {
      throw new ForbiddenException('Missing role context');
    }

    if (!requiredRoles.some((role) => roleSatisfiesRequirement(user.role, role))) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
