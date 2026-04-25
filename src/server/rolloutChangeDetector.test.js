import { describe, expect, test } from "vitest";
import { detectRolloutChanges } from "./rolloutChangeDetector.js";

describe("detectRolloutChanges", () => {
  test("reports changed rollout files after the initial snapshot", () => {
    const previous = new Map([
      ["/tmp/a.jsonl", 10],
      ["/tmp/b.jsonl", 20]
    ]);
    const threads = [
      { id: "thread-a", cwd: "/project/a", rolloutPath: "/tmp/a.jsonl" },
      { id: "thread-b", cwd: "/project/b", rolloutPath: "/tmp/b.jsonl" }
    ];
    const mtimes = new Map([
      ["/tmp/a.jsonl", 11],
      ["/tmp/b.jsonl", 20]
    ]);

    expect(detectRolloutChanges(previous, threads, mtimes)).toEqual({
      next: new Map([
        ["/tmp/a.jsonl", 11],
        ["/tmp/b.jsonl", 20]
      ]),
      changed: [{ threadId: "thread-a", cwd: "/project/a", rolloutPath: "/tmp/a.jsonl" }]
    });
  });

  test("does not report the first snapshot as a user-visible change", () => {
    const threads = [{ id: "thread-a", cwd: "/project/a", rolloutPath: "/tmp/a.jsonl" }];
    const mtimes = new Map([["/tmp/a.jsonl", 10]]);

    expect(detectRolloutChanges(new Map(), threads, mtimes).changed).toEqual([]);
  });
});
