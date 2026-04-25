import os from "node:os";
import path from "node:path";

export const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
export const HOST = process.env.CODEX_REMOTE_HOST || "127.0.0.1";
export const PORT = Number(process.env.CODEX_REMOTE_PORT || 8787);
export const PASSWORD = process.env.CODEX_REMOTE_PASSWORD || "";
export const CODEX_REMOTE_MODEL = process.env.CODEX_REMOTE_MODEL || "gpt-5.4";
export const CODEX_SEND_MODE = process.env.CODEX_SEND_MODE || "desktop";
export const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 30;
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function codexPath(...parts) {
  return path.join(CODEX_HOME, ...parts);
}

export function isLoopbackHost(host = HOST) {
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}
