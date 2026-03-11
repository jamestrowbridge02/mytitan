import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { PatchQuoteDto, UpsertQuoteDto } from "./dto";
import { RevenueService } from "./revenue.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("quotes")
export class QuotesController {
  constructor(private readonly revenue: RevenueService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async list(
    @CurrentUser() user: JwtPayload,
    @Query("customerId") customerId?: string,
    @Query("jobId") jobId?: string,
  ) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.list" });
    return this.revenue.listQuotes(user.companyId, {
      customerId: customerId || undefined,
      jobId: jobId || undefined,
    });
  }

  @Post()
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertQuoteDto) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.create" });
    return this.revenue.createQuote(user.companyId, user.sub, dto);
  }

  @Get(":id")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async detail(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.detail" });
    return this.revenue.getQuote(user.companyId, id);
  }

  @Get(":id/line-items")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async lineItems(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.line_items" });
    const quote = await this.revenue.getQuote(user.companyId, id);
    return quote.lineItems || [];
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async patch(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchQuoteDto) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.update" });
    return this.revenue.updateQuote(user.companyId, user.sub, id, dto);
  }

  @Post(":id/send")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async send(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.send" });
    return this.revenue.sendQuote(user.companyId, user.sub, id);
  }

  @Post(":id/approve")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.approve" });
    return this.revenue.operatorApproveQuote(user.companyId, user.sub, id);
  }

  @Post(":id/decline")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async decline(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body?: { note?: string }) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.decline" });
    return this.revenue.operatorDeclineQuote(user.companyId, user.sub, id, body?.note || null);
  }

  @Post(":id/convert")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async convert(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "quotes.convert" });
    return this.revenue.convertQuote(user.companyId, user.sub, id);
  }
}
