import crypto from "node:crypto";
import fs from "node:fs/promises";
import { PASSWORD, codexPath } from "./config.js";

const passwordFile = codexPath("mobile-workbench-auth.json");
const SCRYPT_KEY_LENGTH = 64;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function readStoredPassword() {
  try {
    const raw = await fs.readFile(passwordFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.salt || !parsed?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeCompareHex(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function passwordStatus() {
  const stored = await readStoredPassword();
  const configured = Boolean(stored || PASSWORD);
  return {
    configured,
    setupRequired: !configured,
    source: stored ? "local" : PASSWORD ? "environment" : "none"
  };
}

export async function verifyPassword(password) {
  const stored = await readStoredPassword();
  if (stored) {
    const key = await scrypt(String(password || ""), stored.salt);
    return safeCompareHex(key.toString("hex"), stored.hash);
  }
  return Boolean(PASSWORD) && String(password || "") === PASSWORD;
}

export async function setPassword(password) {
  const nextPassword = String(password || "");
  if (nextPassword.length < 4) {
    const error = new Error("Password must be at least 4 characters");
    error.statusCode = 400;
    throw error;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(nextPassword, salt);
  await fs.mkdir(codexPath(), { recursive: true });
  await fs.writeFile(
    passwordFile,
    JSON.stringify(
      {
        version: 1,
        algorithm: "scrypt",
        salt,
        hash: key.toString("hex"),
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  return passwordStatus();
}
