import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { extname } from "path";

export const UPLOAD_LIMITS = {
  image: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 20 * 1024 * 1024,
  text: 5 * 1024 * 1024,
  csv: 5 * 1024 * 1024,
  logo: 2 * 1024 * 1024,
  proxy: 110 * 1024 * 1024,
} as const;

const MIME_POLICY: Record<string, { category: keyof typeof UPLOAD_LIMITS; extensions: string[] }> = {
  "image/jpeg": { category: "image", extensions: [".jpg", ".jpeg"] },
  "image/png": { category: "image", extensions: [".png"] },
  "image/webp": { category: "image", extensions: [".webp"] },
  "video/mp4": { category: "video", extensions: [".mp4"] },
  "video/webm": { category: "video", extensions: [".webm"] },
  "video/quicktime": { category: "video", extensions: [".mov"] },
  "application/pdf": { category: "document", extensions: [".pdf"] },
  "text/plain": { category: "text", extensions: [".txt"] },
  "text/csv": { category: "csv", extensions: [".csv"] },
  "application/csv": { category: "csv", extensions: [".csv"] },
  "application/vnd.ms-excel": { category: "csv", extensions: [".csv"] },
};

const DANGEROUS_EXTENSIONS = new Set([
  ".bat", ".bin", ".cmd", ".com", ".cpl", ".dll", ".dmg", ".exe", ".hta", ".htm", ".html",
  ".iso", ".jar", ".js", ".jse", ".lnk", ".msi", ".msp", ".php", ".ps1", ".py", ".scr", ".sh",
  ".svg", ".vb", ".vbe", ".vbs", ".wsf",
]);

export function formatUploadBytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function uploadPolicyFor(fileName: string, mimeType: string) {
  const extension = extname(String(fileName || "")).toLowerCase();
  if (!extension || DANGEROUS_EXTENSIONS.has(extension)) {
    throw new BadRequestException({ code: "UPLOAD_FILE_TYPE_REJECTED", message: "This file type is not allowed." });
  }
  const policy = MIME_POLICY[String(mimeType || "").toLowerCase()];
  if (!policy || !policy.extensions.includes(extension)) {
    throw new BadRequestException({
      code: "UPLOAD_FILE_TYPE_REJECTED",
      message: "The file extension does not match an allowed file type.",
    });
  }
  return { ...policy, extension, maxBytes: UPLOAD_LIMITS[policy.category] };
}

export function assertUploadAllowed(file: { originalname?: string; mimetype?: string; size?: number }) {
  const policy = uploadPolicyFor(file.originalname || "", file.mimetype || "");
  if (Number(file.size || 0) > policy.maxBytes) {
    throw new PayloadTooLargeException({
      statusCode: 413,
      code: "UPLOAD_TOO_LARGE",
      category: policy.category,
      maxBytes: policy.maxBytes,
      maxSize: formatUploadBytes(policy.maxBytes),
      message: `This file is too large. Maximum allowed is ${formatUploadBytes(policy.maxBytes)} for this file type.`,
    });
  }
  return policy;
}
