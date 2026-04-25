function timeMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function inferDesktopState(threadId, messages, managerState = {}) {
  if (managerState?.activeRunId) return managerState;

  const runStates = messages.filter((message) => message.kind === "run_state");
  const latest = runStates.at(-1);
  if (!latest) return managerState;

  if (latest.toolName === "task_complete") {
    return {
      ...managerState,
      threadId,
      activeRunId: null,
      phase: "idle",
      canCancel: false,
      canRetry: Boolean(managerState?.canRetry),
      transport: "desktop",
      rolloutStatus: "complete",
      latestRunStateAt: latest.createdAt
    };
  }

  if (latest.toolName !== "task_started") return managerState;

  const managerTerminalPhase = ["cancelled", "failed", "idle"].includes(managerState?.phase);
  const managerUpdatedAfterStart = timeMs(managerState?.updatedAt) > timeMs(latest.createdAt);
  if (managerState?.transport === "desktop" && managerTerminalPhase && managerUpdatedAfterStart) {
    return {
      ...managerState,
      rolloutStatus: managerState.phase,
      latestRunStateAt: latest.createdAt
    };
  }

  return {
    ...managerState,
    threadId,
    activeRunId: `desktop:${threadId}:${latest.id}`,
    phase: "running",
    canCancel: true,
    canRetry: Boolean(managerState?.canRetry),
    transport: "desktop",
    rolloutStatus: "running",
    latestRunStateAt: latest.createdAt
  };
}
