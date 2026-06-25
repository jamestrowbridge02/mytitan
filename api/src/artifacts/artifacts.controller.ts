import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { promises as fs } from "fs";
import { extname, join } from "path";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ArtifactsService } from "./artifacts.service";
import { UPLOAD_LIMITS } from "../common/upload-policy";

const ARTIFACT_MAX_BYTES = Number(process.env.ARTIFACT_MAX_BYTES ?? UPLOAD_LIMITS.video);

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("artifacts")
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get("governance")
  @Roles("OWNER", "ADMIN")
  mediaGovernance(@CurrentUser() user: JwtPayload) {
    return this.artifacts.getMediaGovernance(user.companyId);
  }

  @Get("entities/:entityType/:entityId")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF", "READ_ONLY")
  listByEntity(
    @CurrentUser() user: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    return this.artifacts.listForEntity(user.companyId, entityType, entityId);
  }

  @Get("entities/:entityType/:entityId/folders")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF", "READ_ONLY")
  listFoldersByEntity(
    @CurrentUser() user: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    return this.artifacts.listFoldersForEntity(user.companyId, entityType, entityId);
  }

  @Post("entities/:entityType/:entityId/upload")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: async (req: any, _file, cb) => {
          try {
            const user = req.user as JwtPayload;
            const entityType = safePathSegment(String(req.params?.entityType || "").toLowerCase() || "artifact");
            const entityId = safePathSegment(String(req.params?.entityId || "unknown"));
            const dir = join(process.cwd(), "uploads", "artifacts", safePathSegment(user.companyId), entityType, entityId);
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
          } catch (error: any) {
            cb(error, "");
          }
        },
        filename: (_req, file, cb) => {
          const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname || "") || ""}`;
          cb(null, safePathSegment(suffix));
        },
      }),
      limits: { fileSize: ARTIFACT_MAX_BYTES },
    }),
  )
  createArtifact(
    @CurrentUser() user: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
    @UploadedFile() file: any,
  ) {
    return this.artifacts.createFromUpload({
      tenantId: user.companyId,
      userId: user.sub,
      entityType,
      entityId,
      label: typeof body?.label === "string" ? body.label : typeof query?.label === "string" ? query.label : null,
      kind: typeof body?.kind === "string" ? body.kind : typeof query?.kind === "string" ? query.kind : "",
      portalVisible: body?.portalVisible ?? query?.portalVisible,
      file,
    });
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  deleteArtifact(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.artifacts.deleteArtifact(user.companyId, user.sub, id);
  }

  @Patch(":id/move")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  moveArtifact(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: Record<string, any>) {
    return this.artifacts.moveArtifact(user.companyId, user.sub, id, String(body?.kind || ""));
  }

  @Patch(":id/visibility")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  updateVisibility(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: Record<string, any>) {
    return this.artifacts.updatePortalVisibility(user.companyId, user.sub, id, body?.portalVisible);
  }

  @Patch("bulk")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  bulkUpdate(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
    return this.artifacts.bulkUpdate(user.companyId, user.sub, body || {});
  }

  @Get("file/:id")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF", "READ_ONLY")
  async downloadArtifact(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { artifact, filePath } = await this.artifacts.getManagedArtifactForTenant(user.companyId, id);
    if (artifact.mimeType) {
      res.setHeader("Content-Type", artifact.mimeType);
    }
    if (artifact.fileName) {
      res.setHeader("Content-Disposition", `inline; filename="${safePathSegment(artifact.fileName)}"`);
    }
    return res.sendFile(filePath);
  }
}
