import { describe, expect, test } from "vitest";
import { mergeFetchedMessagesWithLocalDrafts } from "./messageMerge.js";

describe("mergeFetchedMessagesWithLocalDrafts", () => {
  test("keeps a pending local user message when fetched history has not caught up", () => {
    const fetched = [{ id: "server:1", role: "assistant", kind: "message", text: "Ready", createdAt: "2026-04-25T00:00:00.000Z" }];
    const current = [
      ...fetched,
      {
        id: "local:thread-a:1",
        threadId: "thread-a",
        role: "user",
        kind: "message",
        text: "hello from phone",
        createdAt: "2026-04-25T00:01:00.000Z",
        pending: true
      }
    ];

    expect(mergeFetchedMessagesWithLocalDrafts(fetched, current, "thread-a").map((message) => message.text)).toEqual([
      "Ready",
      "hello from phone"
    ]);
  });

  test("drops the pending local message once fetched history contains the same user text", () => {
    const fetched = [
      { id: "server:1", role: "assistant", kind: "message", text: "Ready", createdAt: "2026-04-25T00:00:00.000Z" },
      { id: "server:2", role: "user", kind: "message", text: "hello from phone", createdAt: "2026-04-25T00:01:04.000Z" }
    ];
    const current = [
      ...fetched.slice(0, 1),
      {
        id: "local:thread-a:1",
        threadId: "thread-a",
        role: "user",
        kind: "message",
        text: "hello from phone",
        createdAt: "2026-04-25T00:01:00.000Z",
        pending: true
      }
    ];

    expect(mergeFetchedMessagesWithLocalDrafts(fetched, current, "thread-a")).toEqual(fetched);
  });

  test("does not carry a pending local message into another thread", () => {
    const fetched = [{ id: "server:1", threadId: "thread-b", role: "assistant", kind: "message", text: "Other", createdAt: "2026-04-25T00:00:00.000Z" }];
    const current = [
      {
        id: "local:thread-a:1",
        threadId: "thread-a",
        role: "user",
        kind: "message",
        text: "wrong thread",
        createdAt: "2026-04-25T00:01:00.000Z",
        pending: true
      }
    ];

    expect(mergeFetchedMessagesWithLocalDrafts(fetched, current, "thread-b")).toEqual(fetched);
  });
});
