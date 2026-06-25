import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { isPlatformAdminUser } from '../common/platform-admin';
import { JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev_insecure'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const db = this.prisma as any;
    const user = await db.user.findFirst({
      where: { id: payload.sub, companyId: payload.companyId },
      select: { tokenVersion: true, emailVerified: true, email: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (Number(payload.tokenVersion ?? 0) !== Number(user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    return {
      ...payload,
      email: user.email,
      role: user.role,
      platformAdmin: isPlatformAdminUser({ email: user.email }),
      emailVerified: Boolean(user.emailVerified),
      tokenVersion: Number(user.tokenVersion ?? 0),
      demoUser: payload.demoUser || user.email === '@mytitan.co.uk',
    };
  }
}
