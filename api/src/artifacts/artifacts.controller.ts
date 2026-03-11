import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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

const ARTIFACT_MAX_BYTES = Number(process.env.ARTIFACT_MAX_BYTES ?? 10 * 1024 * 1024);
const ALLOWED_ARTIFACT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("artifacts")
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get("entities/:entityType/:entityId")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  listByEntity(
    @CurrentUser() user: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    return this.artifacts.listForEntity(user.companyId, entityType, entityId);
  }

  @Post("entities/:entityType/:entityId/upload")
  @Roles("OWNER", "ADMIN", "STAFF")
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
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_ARTIFACT_MIME.has(file.mimetype)) {
          return cb(new BadRequestException("Unsupported artifact file type"), false);
        }
        cb(null, true);
      },
      limits: { fileSize: ARTIFACT_MAX_BYTES },
    }),
  )
  createArtifact(
    @CurrentUser() user: JwtPayload,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Body() body: Record<string, any>,
    @UploadedFile() file: any,
  ) {
    return this.artifacts.createFromUpload({
      tenantId: user.companyId,
      userId: user.sub,
      entityType,
      entityId,
      label: typeof body?.label === "string" ? body.label : null,
      kind: typeof body?.kind === "string" ? body.kind : "",
      portalVisible: body?.portalVisible,
      file,
    });
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  deleteArtifact(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.artifacts.deleteArtifact(user.companyId, user.sub, id);
  }

  @Get("file/:id")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
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
