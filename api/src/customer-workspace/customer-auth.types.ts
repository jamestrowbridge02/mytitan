export interface CustomerJwtPayload {
  sub: string;
  tenantId: string;
  customerId: string;
  email: string;
  scope: "customer";
}
