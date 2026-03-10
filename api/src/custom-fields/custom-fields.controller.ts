import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreateCustomFieldDto, CustomFieldValuesQueryDto, UpdateCustomFieldDto, UpsertCustomFieldValuesDto } from "./custom-fields.dto";
import { CustomFieldsService } from "./custom-fields.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  list(@CurrentUser() user: JwtPayload, @Query("entityType") entityType?: "job" | "booking" | "customer" | "technician", @Query("visible") visible?: string) {
    return this.customFields.listFields(user.companyId, entityType, visible !== "true" ? true : false);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCustomFieldDto) {
    return this.customFields.createField(user, dto);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.updateField(user, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.customFields.deleteField(user, id);
  }

  @Get("values")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  listValues(@CurrentUser() user: JwtPayload, @Query() query: CustomFieldValuesQueryDto) {
    const entityIds = query.entityIds ? String(query.entityIds).split(",").map((value) => value.trim()).filter(Boolean) : [];
    return this.customFields.listValues(user, query.entityType, query.entityId, entityIds);
  }

  @Post("values")
  @Roles("OWNER", "ADMIN", "STAFF")
  upsertValues(@CurrentUser() user: JwtPayload, @Body() dto: UpsertCustomFieldValuesDto) {
    return this.customFields.upsertValues(user, dto);
  }
}
