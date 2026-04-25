import fs from "node:fs/promises";
import path from "node:path";
import { codexPath } from "./config.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function dateFolder(now) {
  const value = now();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeUploadName(name = "upload") {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "upload";
}

export async function saveBase64Upload(upload, { uploadRoot = codexPath("mobile-uploads"), now = () => new Date() } = {}) {
  const data = Buffer.from(upload.dataBase64 || "", "base64");
  if (!data.length) {
    const error = new Error("Upload is empty");
    error.statusCode = 400;
    throw error;
  }
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    const error = new Error("Upload is too large");
    error.statusCode = 413;
    throw error;
  }

  const dir = path.join(uploadRoot, dateFolder(now));
  await fs.mkdir(dir, { recursive: true });
  const safeName = sanitizeUploadName(upload.name);
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await fs.writeFile(filePath, data);

  return {
    name: safeName,
    type: upload.type || "application/octet-stream",
    size: data.byteLength,
    path: filePath
  };
}

export function formatPromptWithAttachments(message, attachments = []) {
  const cleanMessage = (message || "").trim();
  if (!attachments.length) return cleanMessage;
  const lines = attachments.map((attachment) => {
    const type = attachment.type ? ` (${attachment.type})` : "";
    return `- ${attachment.name || "attachment"}${type}: ${attachment.path}`;
  });
  return [cleanMessage, "附件文件：", ...lines].filter(Boolean).join("\n\n").replace(/\n\n- /g, "\n- ");
}
