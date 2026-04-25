import { describe, expect, test } from "vitest";
import { inferDesktopState } from "./threadState.js";

const baseState = {
  threadId: "thread-a",
  activeRunId: null,
  phase: "idle",
  canCancel: false,
  canRetry: true,
  updatedAt: "2026-04-25T07:00:00.000Z"
};

describe("inferDesktopState", () => {
  test("infers running from the latest desktop task_started event", () => {
    expect(
      inferDesktopState("thread-a", [
        {
          id: "started-1",
          kind: "run_state",
          toolName: "task_started",
          createdAt: "2026-04-25T07:00:01.000Z"
        }
      ], baseState)
    ).toMatchObject({
      activeRunId: "desktop:thread-a:started-1",
      phase: "running",
      canCancel: true,
      rolloutStatus: "running"
    });
  });

  test("infers idle from a later task_complete event", () => {
    expect(
      inferDesktopState("thread-a", [
        {
          id: "started-1",
          kind: "run_state",
          toolName: "task_started",
          createdAt: "2026-04-25T07:00:01.000Z"
        },
        {
          id: "complete-1",
          kind: "run_state",
          toolName: "task_complete",
          createdAt: "2026-04-25T07:00:02.000Z"
        }
      ], baseState)
    ).toMatchObject({
      activeRunId: null,
      phase: "idle",
      canCancel: false,
      rolloutStatus: "complete"
    });
  });

  test("does not revive a cancelled desktop run from an older task_started event", () => {
    expect(
      inferDesktopState(
        "thread-a",
        [
          {
            id: "started-1",
            kind: "run_state",
            toolName: "task_started",
            createdAt: "2026-04-25T07:00:01.000Z"
          }
        ],
        {
          ...baseState,
          phase: "cancelled",
          transport: "desktop",
          updatedAt: "2026-04-25T07:00:05.000Z"
        }
      )
    ).toMatchObject({
      activeRunId: null,
      phase: "cancelled",
      canCancel: false,
      rolloutStatus: "cancelled"
    });
  });
});
