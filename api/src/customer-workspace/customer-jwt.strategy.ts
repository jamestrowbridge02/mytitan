import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerJwtPayload } from "./customer-auth.types";

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, "customer-jwt") {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET", "dev_insecure"),
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<CustomerJwtPayload> {
    if (payload.scope !== "customer") {
      throw new UnauthorizedException("Invalid customer session");
    }

    const account = await this.prisma.customerAccount.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        customerId: payload.customerId,
      },
      select: {
        id: true,
        email: true,
        status: true,
        customerId: true,
        tenantId: true,
      },
    });

    if (!account || account.status !== "ACTIVE") {
      throw new UnauthorizedException("Customer session is no longer valid");
    }

    return {
      sub: account.id,
      tenantId: account.tenantId,
      customerId: account.customerId,
      email: account.email,
      scope: "customer",
    };
  }
}
