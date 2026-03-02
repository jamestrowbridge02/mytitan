import { Module } from "@nestjs/common";
import { DevAdminController } from "./dev-admin.controller";

@Module({
  controllers: [DevAdminController],
})
export class AdminModule {}
