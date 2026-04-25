import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { formatPromptWithAttachments, saveBase64Upload, sanitizeUploadName } from "./uploads.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("sanitizeUploadName", () => {
  test("keeps safe filename parts and strips path traversal", () => {
    expect(sanitizeUploadName("../my photo.png")).toBe("my-photo.png");
  });
});

describe("saveBase64Upload", () => {
  test("saves uploaded base64 data under the upload root", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-upload-"));
    tempDirs.push(dir);

    const upload = await saveBase64Upload(
      {
        name: "photo.png",
        type: "image/png",
        dataBase64: Buffer.from("hello").toString("base64")
      },
      { uploadRoot: dir, now: () => new Date("2026-04-25T12:34:56.000Z") }
    );

    expect(upload.name).toBe("photo.png");
    expect(upload.type).toBe("image/png");
    expect(upload.size).toBe(5);
    expect(upload.path.startsWith(dir)).toBe(true);
    await expect(fs.readFile(upload.path, "utf8")).resolves.toBe("hello");
  });
});

describe("formatPromptWithAttachments", () => {
  test("appends uploaded file paths to the outgoing prompt", () => {
    expect(formatPromptWithAttachments("Please inspect this", [{ name: "photo.png", path: "/tmp/photo.png", type: "image/png" }])).toBe(
      "Please inspect this\n\n附件文件：\n- photo.png (image/png): /tmp/photo.png"
    );
  });
});
