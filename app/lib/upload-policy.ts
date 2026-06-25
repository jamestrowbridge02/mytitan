export const UPLOAD_LIMITS = {
  image: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 20 * 1024 * 1024,
  text: 5 * 1024 * 1024,
  csv: 5 * 1024 * 1024,
  logo: 2 * 1024 * 1024,
} as const;

const EXTENSIONS: Record<string, { category: keyof typeof UPLOAD_LIMITS; mime: string[] }> = {
  ".jpg": { category: "image", mime: ["image/jpeg"] },
  ".jpeg": { category: "image", mime: ["image/jpeg"] },
  ".png": { category: "image", mime: ["image/png"] },
  ".webp": { category: "image", mime: ["image/webp"] },
  ".mp4": { category: "video", mime: ["video/mp4"] },
  ".webm": { category: "video", mime: ["video/webm"] },
  ".mov": { category: "video", mime: ["video/quicktime"] },
  ".pdf": { category: "document", mime: ["application/pdf"] },
  ".txt": { category: "text", mime: ["text/plain"] },
  ".csv": { category: "csv", mime: ["text/csv", "application/csv", "application/vnd.ms-excel", ""] },
};

export function formatUploadLimit(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function validateUploadFile(file: File, options?: { category?: keyof typeof UPLOAD_LIMITS; maxBytes?: number }) {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
  const policy = EXTENSIONS[extension];
  if (!policy || (file.type && !policy.mime.includes(file.type))) {
    return "This file type is not allowed.";
  }
  if (options?.category && policy.category !== options.category) {
    return `Choose a valid ${options.category} file.`;
  }
  const maxBytes = options?.maxBytes || UPLOAD_LIMITS[policy.category];
  if (file.size > maxBytes) {
    const guidance =
      policy.category === "image" || policy.category === "video"
        ? " Compress or export the file at a lower resolution, then try again."
        : "";
    return `This file is too large. Maximum allowed is ${formatUploadLimit(maxBytes)} for this file type.${guidance}`;
  }
  return null;
}
