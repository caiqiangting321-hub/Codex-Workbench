import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { normalizeRolloutEvent, parseRolloutFile } from "./rolloutParser.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("normalizeRolloutEvent", () => {
  test("normalizes user_message events", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T01:02:03.000Z",
          type: "event_msg",
          payload: { type: "user_message", thread_id: "thread-a", message: "Hello Codex" }
        },
        7,
        "fallback-thread"
      )
    ).toEqual({
      id: "thread-a:7:user",
      threadId: "thread-a",
      role: "user",
      kind: "message",
      text: "Hello Codex",
      createdAt: "2026-04-25T01:02:03.000Z"
    });
  });

  test("strips in-app browser wrapper from user messages", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T01:02:03.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: [
              "# In app browser:",
              "- The user has the in-app browser open.",
              "- Current URL: http://127.0.0.1:8787/",
              "",
              "## My request for Codex:",
              "对对，我要的就是这个效果"
            ].join("\n")
          }
        },
        17,
        "fallback-thread"
      )
    ).toMatchObject({
      role: "user",
      kind: "message",
      text: "对对，我要的就是这个效果"
    });
  });

  test("ignores internal unified exec process warnings", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T01:02:03.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message:
              "Warning: The maximum number of unified exec processes you can keep open is 60 and you currently have 61 processes open. Reuse older processes or close them to prevent automatic pruning of old processes"
          }
        },
        18,
        "fallback-thread"
      )
    ).toBeNull();
  });

  test("normalizes agent_message events", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T02:03:04.000Z",
          type: "event_msg",
          payload: { type: "agent_message", message: "Working on it" }
        },
        8,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:8:assistant",
      threadId: "fallback-thread",
      role: "assistant",
      kind: "message",
      text: "Working on it",
      createdAt: "2026-04-25T02:03:04.000Z"
    });
  });

  test("normalizes response_item message content", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T03:04:05.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "First line" }, { text: "Second line" }]
          }
        },
        9,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:9:assistant",
      threadId: "fallback-thread",
      role: "assistant",
      kind: "message",
      text: "First line\nSecond line",
      createdAt: "2026-04-25T03:04:05.000Z"
    });
  });

  test("ignores hidden developer and system response messages", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T03:04:05.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "developer",
            content: [{ type: "output_text", text: "hidden instructions" }]
          }
        },
        12,
        "fallback-thread"
      )
    ).toBeNull();
  });

  test("normalizes function_call response items", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T04:05:06.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            call_id: "call-123",
            name: "shell",
            arguments: "{\"cmd\":\"pwd\"}"
          }
        },
        10,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:10:call-123",
      threadId: "fallback-thread",
      role: "tool",
      kind: "tool_call",
      toolName: "shell",
      toolStatus: "started",
      text: "{\"cmd\":\"pwd\"}",
      createdAt: "2026-04-25T04:05:06.000Z"
    });
  });

  test("normalizes function_call_output response items", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:07.000Z",
          type: "response_item",
          payload: { type: "function_call_output", call_id: "call-123", output: "ok" }
        },
        11,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:11:call-123",
      threadId: "fallback-thread",
      role: "tool",
      kind: "tool_output",
      toolStatus: "finished",
      outputPreview: "ok",
      createdAt: "2026-04-25T05:06:07.000Z"
    });
  });

  test("normalizes custom_tool_call response items", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:07.000Z",
          type: "response_item",
          payload: { type: "custom_tool_call", call_id: "call-456", name: "apply_patch", input: "*** Begin Patch" }
        },
        12,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:12:call-456",
      threadId: "fallback-thread",
      role: "tool",
      kind: "tool_call",
      toolName: "apply_patch",
      toolStatus: "started",
      text: "*** Begin Patch",
      createdAt: "2026-04-25T05:06:07.000Z"
    });
  });

  test("adds desktop-style activity labels for command runs", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:07.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            call_id: "call-run",
            name: "exec_command",
            arguments: JSON.stringify({ cmd: "npm test && npm run build" })
          }
        },
        14,
        "fallback-thread"
      )
    ).toMatchObject({
      activityType: "run",
      activityLabel: "已运行 npm test && npm run build"
    });
  });

  test("adds desktop-style activity labels for file reads", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:07.000Z",
          type: "event_msg",
          payload: {
            type: "exec_command_end",
            call_id: "call-read",
            status: "completed",
            command: ["/bin/zsh", "-lc", "sed -n '1,80p' src/client/App.jsx"],
            parsed_cmd: [{ type: "read", name: "App.jsx", path: "src/client/App.jsx" }],
            aggregated_output: "content"
          }
        },
        15,
        "fallback-thread"
      )
    ).toMatchObject({
      activityType: "read",
      activityLabel: "已浏览 App.jsx"
    });
  });

  test("adds desktop-style activity labels for apply_patch edits", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:07.000Z",
          type: "response_item",
          payload: {
            type: "custom_tool_call",
            call_id: "call-edit",
            name: "apply_patch",
            input: [
              "*** Begin Patch",
              "*** Update File: /tmp/App.jsx",
              "@@",
              "-old",
              "+new",
              "+extra",
              "*** End Patch"
            ].join("\n")
          }
        },
        16,
        "fallback-thread"
      )
    ).toMatchObject({
      activityType: "edit",
      activityLabel: "已编辑 App.jsx +2 -1"
    });
  });

  test("normalizes task lifecycle events", () => {
    expect(
      normalizeRolloutEvent(
        {
          timestamp: "2026-04-25T05:06:08.000Z",
          type: "event_msg",
          payload: { type: "task_complete", duration_ms: 1234, last_agent_message: "Done" }
        },
        13,
        "fallback-thread"
      )
    ).toEqual({
      id: "fallback-thread:13:task_complete",
      threadId: "fallback-thread",
      role: "system",
      kind: "run_state",
      toolName: "task_complete",
      toolStatus: "finished",
      outputPreview: "Task complete in 1.2s\nDone",
      createdAt: "2026-04-25T05:06:08.000Z"
    });
  });
});

describe("parseRolloutFile", () => {
  test("keeps repeated visible messages when they are separate turns", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rollout-parser-"));
    tempDirs.push(dir);
    const rolloutPath = path.join(dir, "rollout.jsonl");
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-04-25T06:07:08.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "test" }
        }),
        JSON.stringify({
          timestamp: "2026-04-25T06:07:08.100Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [{ type: "input_text", text: "test" }] }
        }),
        JSON.stringify({
          timestamp: "2026-04-25T06:08:08.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "test" }
        })
      ].join("\n"),
      "utf8"
    );

    const events = await parseRolloutFile(rolloutPath, "fixture-thread");

    expect(events.map((event) => event.text)).toEqual(["test", "test"]);
  });

  test("returns a parse-error event for malformed lines in a temporary fixture", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rollout-parser-"));
    tempDirs.push(dir);
    const rolloutPath = path.join(dir, "rollout.jsonl");
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-04-25T06:07:08.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "valid" }
        }),
        "{this is not json"
      ].join("\n"),
      "utf8"
    );

    const events = await parseRolloutFile(rolloutPath, "fixture-thread");

    expect(events).toEqual([
      {
        id: "fixture-thread:1:user",
        threadId: "fixture-thread",
        role: "user",
        kind: "message",
        text: "valid",
        createdAt: "2026-04-25T06:07:08.000Z"
      },
      {
        id: "fixture-thread:2:parse-error",
        threadId: "fixture-thread",
        role: "system",
        kind: "tool_output",
        toolStatus: "failed",
        outputPreview: "{this is not json",
        createdAt: "1970-01-01T00:00:00.000Z"
      }
    ]);
  });
});
