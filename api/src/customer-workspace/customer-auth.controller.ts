import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentCustomer } from "./current-customer.decorator";
import { CustomerJwtPayload } from "./customer-auth.types";
import { CustomerJwtAuthGuard } from "./customer-auth.guard";
import { ActivateCustomerAccountDto, CustomerLoginDto } from "./dto";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@Controller("customer-auth")
export class CustomerAuthController {
  constructor(private readonly customerWorkspace: CustomerWorkspaceService) {}

  @Post("activate")
  activate(@Body() dto: ActivateCustomerAccountDto) {
    return this.customerWorkspace.activateCustomerAccount(dto.token, dto.password);
  }

  @Post("login")
  login(@Body() dto: CustomerLoginDto) {
    return this.customerWorkspace.loginCustomerAccount(dto.email, dto.password);
  }

  @Post("logout")
  logout() {
    return { ok: true };
  }

  @Get("me")
  @UseGuards(CustomerJwtAuthGuard)
  me(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.customerWorkspace.getCustomerAuthMe(customer);
  }
}
