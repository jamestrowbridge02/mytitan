import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentCustomer } from "./current-customer.decorator";
import { CustomerJwtAuthGuard } from "./customer-auth.guard";
import { CustomerJwtPayload } from "./customer-auth.types";
import { CustomerServicePlanChangeRequestDto, CustomerServicePlanDecisionDto } from "./dto";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@UseGuards(CustomerJwtAuthGuard)
@Controller("customer/service-plans")
export class CustomerServicePlansController {
  constructor(private readonly customerWorkspace: CustomerWorkspaceService) {}

  @Get()
  list(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.customerWorkspace.listCustomerServicePlans(customer.tenantId, customer.customerId);
  }

  @Get(":id")
  detail(@CurrentCustomer() customer: CustomerJwtPayload, @Param("id") id: string) {
    return this.customerWorkspace.getCustomerServicePlanById(customer.tenantId, customer.customerId, id);
  }

  @Post(":id/renew")
  renew(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerServicePlanDecisionDto,
  ) {
    return this.customerWorkspace.renewCustomerServicePlan(customer.tenantId, customer.customerId, id, dto.note);
  }

  @Post(":id/decline-renewal")
  declineRenewal(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerServicePlanDecisionDto,
  ) {
    return this.customerWorkspace.declineCustomerServicePlanRenewal(customer.tenantId, customer.customerId, id, dto.note);
  }

  @Post(":id/change-request")
  createRequest(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerServicePlanChangeRequestDto,
  ) {
    return this.customerWorkspace.createCustomerServicePlanChangeRequest(customer.tenantId, customer.customerId, id, dto);
  }
}
