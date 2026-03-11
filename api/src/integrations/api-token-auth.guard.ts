import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationPlatformService } from './integration-platform.service';

@Injectable()
export class ApiTokenAuthGuard implements CanActivate {
  constructor(private readonly platform: IntegrationPlatformService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = String(request.headers?.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Missing API token');
    }
    request.apiToken = await this.platform.authenticateApiToken(match[1]);
    return true;
  }
}
