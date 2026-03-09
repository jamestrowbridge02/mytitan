import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CustomersService } from "./customers.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
  ) {
    return this.customers.list(user.companyId, {
      search: search || "",
      limit: Number(limit || 50),
    });
  }

  @Get(":idOrSlug")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  detail(@CurrentUser() user: JwtPayload, @Param("idOrSlug") idOrSlug: string) {
    return this.customers.getByIdOrSlug(user.companyId, idOrSlug);
  }
}
