import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const tempDirs = [];

async function loadPasswordStore({ envPassword = "", codexHome = null } = {}) {
  vi.resetModules();
  const dir = codexHome || (await fs.mkdtemp(path.join(os.tmpdir(), "codex-password-store-")));
  tempDirs.push(dir);
  process.env.CODEX_HOME = dir;
  process.env.CODEX_REMOTE_PASSWORD = envPassword;
  return import("./passwordStore.js");
}

afterEach(async () => {
  delete process.env.CODEX_HOME;
  delete process.env.CODEX_REMOTE_PASSWORD;
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("passwordStore", () => {
  test("requires first-run setup when no local or environment password exists", async () => {
    const { passwordStatus } = await loadPasswordStore();

    await expect(passwordStatus()).resolves.toMatchObject({
      configured: false,
      setupRequired: true,
      source: "none"
    });
  });

  test("uses environment password as a fallback until a local password is saved", async () => {
    const { passwordStatus, setPassword, verifyPassword } = await loadPasswordStore({ envPassword: "1234" });

    await expect(passwordStatus()).resolves.toMatchObject({ configured: true, setupRequired: false, source: "environment" });
    await expect(verifyPassword("1234")).resolves.toBe(true);

    await setPassword("5678");

    await expect(passwordStatus()).resolves.toMatchObject({ configured: true, setupRequired: false, source: "local" });
    await expect(verifyPassword("1234")).resolves.toBe(false);
    await expect(verifyPassword("5678")).resolves.toBe(true);
  });

  test("stores a salted hash instead of plaintext", async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-password-store-"));
    const { setPassword } = await loadPasswordStore({ codexHome });

    await setPassword("abcd");
    const raw = await fs.readFile(path.join(codexHome, "mobile-workbench-auth.json"), "utf8");

    expect(raw).not.toContain("abcd");
    expect(JSON.parse(raw)).toMatchObject({
      algorithm: "scrypt",
      version: 1,
      salt: expect.any(String),
      hash: expect.any(String)
    });
  });
});
