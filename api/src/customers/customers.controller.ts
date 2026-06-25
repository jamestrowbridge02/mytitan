import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
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
    @Query("locationId") locationId?: string,
  ) {
    return this.customers.list(user.companyId, {
      search: search || "",
      limit: Number(limit || 50),
      locationId: locationId || undefined,
    });
  }

  @Get(":idOrSlug")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  detail(@CurrentUser() user: JwtPayload, @Param("idOrSlug") idOrSlug: string) {
    return this.customers.getByIdOrSlug(user.companyId, idOrSlug);
  }

  @Patch(":idOrSlug/payment-terms")
  @Roles("OWNER", "ADMIN", "STAFF")
  updatePaymentTerms(
    @CurrentUser() user: JwtPayload,
    @Param("idOrSlug") idOrSlug: string,
    @Body() body: { paymentTermsDays?: number | null },
  ) {
    return this.customers.updatePaymentTerms(user.companyId, user.sub, idOrSlug, body.paymentTermsDays);
  }
}
