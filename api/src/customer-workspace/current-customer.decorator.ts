import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { CustomerJwtPayload } from "./customer-auth.types";

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerJwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as CustomerJwtPayload;
  },
);
