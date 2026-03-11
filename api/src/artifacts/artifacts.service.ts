import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../events/activity.service";
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";

type ArtifactEntityType = "JOB" | "CUSTOMER";
type ArtifactKind = "INVOICE" | "RECEIPT" | "JOB_ATTACHMENT" | "CUSTOMER_ATTACHMENT" | "PORTAL_DOCUMENT";

type ArtifactRecord = {
  id: string;
  tenantId: string;
  entityType: ArtifactEntityType;
  entityId: string;
  kind: ArtifactKind;
  label: string;
  fileName?: string | null;
  storagePath?: string | null;
  externalUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  portalVisible: boolean;
  createdByUserId?: string | null;
  createdAt: Date;
};

function normalizeEntityType(value: string): ArtifactEntityType {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "JOB" || normalized === "CUSTOMER") return normalized;
  throw new BadRequestException("Unsupported artifact entity type");
}

function normalizeArtifactKind(entityType: ArtifactEntityType, value: string): ArtifactKind {
  const normalized = String(value || "").trim().toUpperCase();
  const allowed: Record<ArtifactEntityType, ArtifactKind[]> = {
    JOB: ["INVOICE", "RECEIPT", "JOB_ATTACHMENT", "PORTAL_DOCUMENT"],
    CUSTOMER: ["CUSTOMER_ATTACHMENT"],
  };
  if (allowed[entityType].includes(normalized as ArtifactKind)) {
    return normalized as ArtifactKind;
  }
  throw new BadRequestException("Unsupported artifact kind for entity");
}

@Injectable()
export class ArtifactsService {
  private readonly logger = new Logger(ArtifactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private rootDir() {
    return resolve(process.cwd(), process.env.ARTIFACTS_STORAGE_ROOT || "uploads/artifacts");
  }

  private relativeStoragePath(tenantId: string, entityType: ArtifactEntityType, entityId: string, fileName: string) {
    return join(tenantId, entityType.toLowerCase(), entityId, fileName);
  }

  private absoluteStoragePath(storagePath: string) {
    return resolve(this.rootDir(), storagePath);
  }

  private ensureLocalPath(storagePath: string) {
    const resolved = this.absoluteStoragePath(storagePath);
    const root = this.rootDir();
    if (!resolved.startsWith(root)) {
      throw new BadRequestException("Invalid artifact storage path");
    }
    return resolved;
  }

  private asBoolean(value: any) {
    return value === true || value === "true" || value === "1" || value === 1;
  }

  private formatBytes(value?: number | null) {
    const size = Number(value || 0);
    if (!size) return null;
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
  }

  private buildManagedDownloadPath(id: string) {
    return `/artifacts/file/${id}`;
  }

  private buildPublicDownloadPath(jobToken: string, artifactId: string) {
    return `/public/job/${jobToken}/artifacts/${artifactId}`;
  }

  private toArtifactView(record: ArtifactRecord, options?: { publicToken?: string | null; publicView?: boolean }) {
    const isManaged = Boolean(record.storagePath);
    const downloadPath = options?.publicView
      ? isManaged && options.publicToken
        ? this.buildPublicDownloadPath(options.publicToken, record.id)
        : null
      : isManaged
      ? this.buildManagedDownloadPath(record.id)
      : null;

    return {
      id: record.id,
      entityType: record.entityType.toLowerCase(),
      entityId: record.entityId,
      kind: record.kind,
      label: record.label,
      fileName: record.fileName || null,
      mimeType: record.mimeType || null,
      sizeBytes: record.sizeBytes ?? null,
      sizeLabel: this.formatBytes(record.sizeBytes),
      portalVisible: Boolean(record.portalVisible),
      createdAt: record.createdAt,
      source: "managed",
      managed: isManaged,
      downloadPath,
      downloadUrl: record.externalUrl || downloadPath,
      deletable: true,
    };
  }

  private toLegacyArtifactView(params: {
    id: string;
    entityType: ArtifactEntityType;
    entityId: string;
    kind: ArtifactKind;
    label: string;
    url: string;
    portalVisible?: boolean;
    createdAt?: Date | null;
  }) {
    return {
      id: params.id,
      entityType: params.entityType.toLowerCase(),
      entityId: params.entityId,
      kind: params.kind,
      label: params.label,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      sizeLabel: null,
      portalVisible: Boolean(params.portalVisible),
      createdAt: params.createdAt || null,
      source: "legacy",
      managed: false,
      downloadPath: null,
      downloadUrl: params.url,
      deletable: false,
    };
  }

  private async ensureEntityExists(tenantId: string, entityType: ArtifactEntityType, entityId: string) {
    const db = this.prisma as any;
    if (entityType === "JOB") {
      const job = await db.job.findFirst({
        where: { id: entityId, companyId: tenantId },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          invoicePdfUrl: true,
          paymentReceiptUrl: true,
          createdAt: true,
        },
      });
      if (!job) throw new NotFoundException("Job not found");
      return job;
    }

    const customer = await db.customer.findFirst({
      where: {
        companyId: tenantId,
        OR: [{ id: entityId }, { slug: entityId }],
      },
      select: { id: true, name: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  private async maybePushArtifactActivity(params: {
    tenantId: string;
    userId?: string | null;
    entityType: ArtifactEntityType;
    entityId: string;
    kind: ArtifactKind;
    label: string;
    action: "created" | "deleted";
    customerId?: string | null;
    customerName?: string | null;
    jobRef?: string | null;
  }) {
    const eventType = params.action === "created" ? "artifact.created" : "artifact.deleted";
    const verb = params.action === "created" ? "Added" : "Removed";
    await this.activity.push({
      type: eventType,
      label: `${verb} ${params.label}`,
      tenantId: params.tenantId,
      customerId: params.customerId || null,
      customerName: params.customerName || null,
      jobId: params.entityType === "JOB" ? params.entityId : null,
      jobRef: params.jobRef || null,
      payloadJson: {
        entityType: params.entityType,
        entityId: params.entityId,
        kind: params.kind,
        label: params.label,
        action: params.action,
        actorUserId: params.userId || null,
      },
    });
  }

  async listForEntity(tenantId: string, entityTypeInput: string, entityId: string) {
    const entityType = normalizeEntityType(entityTypeInput);
    const entity = await this.ensureEntityExists(tenantId, entityType, entityId);
    const resolvedEntityId = entity.id;

    const rows = await this.prisma.documentArtifact.findMany({
      where: {
        tenantId,
        entityType,
        entityId: resolvedEntityId,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const items = rows.map((row) => this.toArtifactView(row as unknown as ArtifactRecord));
    const existingUrls = new Set(items.map((item) => item.downloadUrl).filter(Boolean));

    if (entityType === "JOB") {
      if (entity.invoicePdfUrl && !existingUrls.has(entity.invoicePdfUrl)) {
        items.push(this.toLegacyArtifactView({
          id: `legacy-invoice-${resolvedEntityId}`,
          entityType,
          entityId: resolvedEntityId,
          kind: "INVOICE",
          label: "Issued invoice PDF",
          url: entity.invoicePdfUrl,
          portalVisible: true,
          createdAt: entity.createdAt || null,
        }));
      }
      if (entity.paymentReceiptUrl && !existingUrls.has(entity.paymentReceiptUrl)) {
        items.push(this.toLegacyArtifactView({
          id: `legacy-receipt-${resolvedEntityId}`,
          entityType,
          entityId: resolvedEntityId,
          kind: "RECEIPT",
          label: "Payment receipt",
          url: entity.paymentReceiptUrl,
          portalVisible: true,
          createdAt: entity.createdAt || null,
        }));
      }
    }

    return items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  async createFromUpload(params: {
    tenantId: string;
    userId: string;
    entityType: string;
    entityId: string;
    label?: string | null;
    kind: string;
    portalVisible?: boolean | string | number;
    file: any;
  }) {
    if (!params.file) {
      throw new BadRequestException("Artifact file is required");
    }
    const entityType = normalizeEntityType(params.entityType);
    const kind = normalizeArtifactKind(entityType, params.kind);
    const entity = await this.ensureEntityExists(params.tenantId, entityType, params.entityId);
    const resolvedEntityId = entity.id;
    const storagePath = this.relativeStoragePath(params.tenantId, entityType, resolvedEntityId, params.file.filename);
    if (params.file.path) {
      const destination = this.absoluteStoragePath(storagePath);
      await fs.mkdir(dirname(destination), { recursive: true });
      if (resolve(params.file.path) !== destination) {
        await fs.rename(params.file.path, destination);
      }
    }
    const label = String(params.label || params.file.originalname || kind.replaceAll("_", " ")).trim().slice(0, 120);
    if (!label) {
      throw new BadRequestException("Artifact label is required");
    }

    const portalVisible = entityType === "JOB" && this.asBoolean(params.portalVisible);
    const record = await this.prisma.documentArtifact.create({
      data: {
        tenantId: params.tenantId,
        entityType,
        entityId: resolvedEntityId,
        kind,
        label,
        fileName: params.file.originalname || params.file.filename,
        storagePath,
        mimeType: params.file.mimetype || null,
        sizeBytes: params.file.size || null,
        portalVisible,
        createdByUserId: params.userId,
      },
    });

    await this.maybePushArtifactActivity({
      tenantId: params.tenantId,
      userId: params.userId,
      entityType,
      entityId: resolvedEntityId,
      kind,
      label,
      action: "created",
      customerId: entityType === "JOB" ? entity.customerId || null : resolvedEntityId,
      customerName: entityType === "JOB" ? entity.customerName || null : entity.name || null,
      jobRef: entityType === "JOB" ? entity.jobRef || null : null,
    });

    return this.toArtifactView(record as unknown as ArtifactRecord);
  }

  async deleteArtifact(tenantId: string, userId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact) throw new NotFoundException("Artifact not found");

    const entity = await this.ensureEntityExists(tenantId, artifact.entityType as ArtifactEntityType, artifact.entityId);

    await this.prisma.documentArtifact.delete({ where: { id: artifact.id } });

    if (artifact.storagePath) {
      try {
        await fs.unlink(this.ensureLocalPath(artifact.storagePath));
      } catch (error: any) {
        this.logger.warn(`artifact_delete_file_missing id=${artifact.id} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.maybePushArtifactActivity({
      tenantId,
      userId,
      entityType: artifact.entityType as ArtifactEntityType,
      entityId: artifact.entityId,
      kind: artifact.kind as ArtifactKind,
      label: artifact.label,
      action: "deleted",
      customerId: artifact.entityType === "JOB" ? entity.customerId || null : entity.id,
      customerName: artifact.entityType === "JOB" ? entity.customerName || null : entity.name || null,
      jobRef: artifact.entityType === "JOB" ? entity.jobRef || null : null,
    });

    return { ok: true };
  }

  async getManagedArtifactForTenant(tenantId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact?.storagePath) {
      throw new NotFoundException("Artifact file not found");
    }
    return {
      artifact,
      filePath: this.ensureLocalPath(artifact.storagePath),
    };
  }

  async listPortalArtifactsForJob(tenantId: string, jobId: string, jobToken: string, legacy?: { invoicePdfUrl?: string | null; paymentReceiptUrl?: string | null; createdAt?: Date | null }) {
    const rows = await this.prisma.documentArtifact.findMany({
      where: {
        tenantId,
        entityType: "JOB",
        entityId: jobId,
        portalVisible: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const items = rows.map((row) => this.toArtifactView(row as unknown as ArtifactRecord, { publicToken: jobToken, publicView: true }));
    const existingUrls = new Set(items.map((item) => item.downloadUrl).filter(Boolean));
    if (legacy?.invoicePdfUrl && !existingUrls.has(legacy.invoicePdfUrl)) {
      items.push(this.toLegacyArtifactView({
        id: `legacy-invoice-${jobId}`,
        entityType: "JOB",
        entityId: jobId,
        kind: "INVOICE",
        label: "Issued invoice PDF",
        url: legacy.invoicePdfUrl,
        portalVisible: true,
        createdAt: legacy.createdAt || null,
      }));
    }
    if (legacy?.paymentReceiptUrl && !existingUrls.has(legacy.paymentReceiptUrl)) {
      items.push(this.toLegacyArtifactView({
        id: `legacy-receipt-${jobId}`,
        entityType: "JOB",
        entityId: jobId,
        kind: "RECEIPT",
        label: "Payment receipt",
        url: legacy.paymentReceiptUrl,
        portalVisible: true,
        createdAt: legacy.createdAt || null,
      }));
    }

    return items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  async getPortalArtifactForJob(tenantId: string, jobId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: {
        id: artifactId,
        tenantId,
        entityType: "JOB",
        entityId: jobId,
        portalVisible: true,
      },
    });
    if (!artifact?.storagePath) {
      throw new NotFoundException("Portal artifact not found");
    }
    return {
      artifact,
      filePath: this.ensureLocalPath(artifact.storagePath),
    };
  }
}
