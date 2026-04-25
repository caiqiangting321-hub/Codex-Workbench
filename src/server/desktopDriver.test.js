import { describe, expect, test } from "vitest";
import { buildCodexThreadDeepLink } from "./desktopDriver.js";

describe("buildCodexThreadDeepLink", () => {
  test("builds Codex Desktop's thread deeplink URL", () => {
    expect(buildCodexThreadDeepLink("8d34fc9a-1a1f-4a0b-94dd-0119407a0b11")).toBe(
      "codex://threads/8d34fc9a-1a1f-4a0b-94dd-0119407a0b11"
    );
  });

  test("encodes the thread id path segment", () => {
    expect(buildCodexThreadDeepLink("thread/with spaces")).toBe("codex://threads/thread%2Fwith%20spaces");
  });
});
