import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { CODEX_REMOTE_MODEL, CODEX_SEND_MODE } from "./config.js";
import { openCodexThreadInDesktop, sendToCodexDesktop, stopCodexDesktopResponse } from "./desktopDriver.js";

class RunManagerError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RunManager extends EventEmitter {
  constructor({ getThread, appServerClient = null }) {
    super();
    this.getThread = getThread;
    this.appServerClient = appServerClient;
    this.states = new Map();
    this.lastInputs = new Map();
    this.model = CODEX_REMOTE_MODEL;
    this.threadModels = new Map();
  }

  getModel(threadId = null, fallbackModel = "") {
    return (threadId && this.threadModels.get(threadId)) || fallbackModel || this.model;
  }

  setModel(model, threadId = null) {
    const nextModel = String(model || "").trim();
    if (!nextModel) throw new RunManagerError(400, "Model is required");
    if (threadId) {
      this.threadModels.set(threadId, nextModel);
      this.emit("model.changed", { threadId, model: nextModel });
      return { threadId, model: nextModel };
    }
    this.model = nextModel;
    this.emit("model.changed", { model: this.model });
    return { model: this.model };
  }

  getState(threadId) {
    const state =
      this.states.get(threadId) || {
        threadId,
        activeRunId: null,
        phase: "idle",
        canCancel: false,
        canRetry: this.lastInputs.has(threadId)
      };
    const { process, ...publicState } = state;
    return publicState;
  }

  getActiveStates() {
    return Array.from(this.states.values()).filter((state) => state.activeRunId);
  }

  async send(threadId, prompt) {
    if (!prompt?.trim()) throw new RunManagerError(400, "Message is required");
    const current = this.getState(threadId);
    if (current.activeRunId) throw new RunManagerError(409, "Thread already has an active run");
    const runId = `${threadId}:${Date.now()}`;
    this.#setState(threadId, {
      threadId,
      activeRunId: runId,
      phase: "starting",
      canCancel: false,
      canRetry: false
    });
    const thread = await this.getThread(threadId);
    if (!thread) {
      this.#clearRun(threadId);
      throw new RunManagerError(404, "Thread not found");
    }
    this.lastInputs.set(threadId, prompt);
    return this.#start(thread, prompt, runId, this.getModel(thread.id, thread.model));
  }

  async retry(threadId) {
    const prompt = this.lastInputs.get(threadId);
    if (!prompt) throw new RunManagerError(400, "No previous input to retry");
    return this.send(threadId, prompt);
  }

  async cancel(threadId) {
    const state = this.states.get(threadId);
    if (state?.transport === "app-server" && state.turnId && this.appServerClient) {
      this.appServerClient.interrupt(threadId, state.turnId).catch((error) => {
        this.emit("run.failed", { threadId, runId: state.activeRunId, error: error.message });
      });
      this.#setState(threadId, { ...state, phase: "cancelling", canCancel: false });
      return { cancelled: true, state: this.getState(threadId) };
    }
    if (CODEX_SEND_MODE === "desktop") {
      const thread = await this.getThread(threadId);
      if (!thread) throw new RunManagerError(404, "Thread not found");
      const runId = state?.activeRunId || null;
      this.#setState(threadId, {
        threadId,
        activeRunId: null,
        phase: "cancelling",
        canCancel: false,
        canRetry: this.lastInputs.has(threadId),
        transport: "desktop"
      });
      await openCodexThreadInDesktop(threadId);
      await delay(250);
      await stopCodexDesktopResponse();
      this.#setState(threadId, {
        threadId,
        activeRunId: null,
        phase: "cancelled",
        canCancel: false,
        canRetry: this.lastInputs.has(threadId),
        transport: "desktop"
      });
      this.emit("run.failed", { threadId, runId, signal: "desktop-interrupt", transport: "desktop" });
      return { cancelled: true, state: this.getState(threadId) };
    }
    if (!state?.process) return { cancelled: false, state: this.getState(threadId) };
    state.process.kill("SIGTERM");
    this.#setState(threadId, { ...state, phase: "cancelling", canCancel: false });
    return { cancelled: true, state: this.getState(threadId) };
  }

  #setState(threadId, state) {
    this.states.set(threadId, { ...state, updatedAt: new Date().toISOString() });
    this.emit("status", this.getState(threadId));
  }

  #isRunCurrent(threadId, runId) {
    return this.states.get(threadId)?.activeRunId === runId;
  }

  completeAppServerTurn(threadId, turn, failed = false) {
    const state = this.states.get(threadId);
    if (!state?.activeRunId || state.transport !== "app-server") return;
    if (state.turnId && turn?.id && state.turnId !== turn.id) return;
    const phase = failed || turn?.status === "failed" ? "failed" : turn?.status === "interrupted" ? "cancelled" : "idle";
    this.#setState(threadId, {
      threadId,
      activeRunId: null,
      turnId: null,
      phase,
      canCancel: false,
      canRetry: this.lastInputs.has(threadId),
      transport: "app-server"
    });
    this.emit(phase === "idle" ? "run.finished" : "run.failed", {
      threadId,
      runId: state.activeRunId,
      turnId: turn?.id || state.turnId || null,
      transport: "app-server"
    });
  }

  #start(thread, prompt, runId, model) {
    if (CODEX_SEND_MODE === "desktop") return this.#startViaDesktop(thread, prompt, runId);
    if (this.appServerClient) return this.#startViaAppServer(thread, prompt, runId, model);
    return this.#startViaCli(thread, prompt, runId, model);
  }

  #startViaDesktop(thread, prompt, runId) {
    this.#setState(thread.id, {
      threadId: thread.id,
      activeRunId: runId,
      phase: "sending-to-desktop",
      canCancel: true,
      canRetry: false,
      transport: "desktop"
    });

    console.log(`[send:${runId}] desktop target=${thread.id} chars=${prompt.length}`);
    openCodexThreadInDesktop(thread.id)
      .then(() => delay(650))
      .then(async () => {
        if (!this.#isRunCurrent(thread.id, runId)) return false;
        await sendToCodexDesktop(prompt);
        return true;
      })
      .then((delivered) => {
        if (!delivered) {
          console.log(`[send:${runId}] desktop cancelled before delivery`);
          return;
        }
        console.log(`[send:${runId}] desktop delivered`);
        this.emit("run.event", { threadId: thread.id, runId, event: { type: "desktop.delivered" }, transport: "desktop" });
        this.#setState(thread.id, {
          threadId: thread.id,
          activeRunId: null,
          phase: "idle",
          canCancel: false,
          canRetry: this.lastInputs.has(thread.id),
          transport: "desktop"
        });
        this.emit("run.finished", { threadId: thread.id, runId, transport: "desktop" });
      })
      .catch((error) => {
        console.error(`[send:${runId}] desktop failed: ${error.stderr || error.message}`);
        this.#setState(thread.id, {
          threadId: thread.id,
          activeRunId: null,
          phase: "failed",
          canCancel: false,
          canRetry: this.lastInputs.has(thread.id),
          lastError: error.stderr || error.message,
          transport: "desktop"
        });
        this.emit("run.failed", { threadId: thread.id, runId, error: error.message, transport: "desktop" });
      });

    this.emit("run.started", { threadId: thread.id, runId, transport: "desktop" });
    return this.getState(thread.id);
  }

  #startViaAppServer(thread, prompt, runId, model) {
    this.#setState(thread.id, {
      threadId: thread.id,
      activeRunId: runId,
      phase: "resuming",
      canCancel: false,
      canRetry: false,
      transport: "app-server"
    });

    this.appServerClient
      .resumeThread(thread)
      .then(() => this.appServerClient.startTurn(thread.id, prompt, model))
      .then((result) => {
        this.#setState(thread.id, {
          threadId: thread.id,
          activeRunId: runId,
          turnId: result?.turn?.id || null,
          phase: "running",
          canCancel: Boolean(result?.turn?.id),
          canRetry: false,
          transport: "app-server"
        });
        this.emit("run.started", { threadId: thread.id, runId, turnId: result?.turn?.id || null, transport: "app-server" });
      })
      .catch((error) => {
        this.emit("run.output", { threadId: thread.id, runId, stream: "app-server", text: `App server failed, falling back to CLI: ${error.message}` });
        this.#startViaCli(thread, prompt, runId);
      });

    return this.getState(thread.id);
  }

  #startViaCli(thread, prompt, runId, model) {
    const child = spawn(
      "codex",
      ["exec", "resume", "--json", "--skip-git-repo-check", "--model", model, thread.id, prompt],
      {
        cwd: thread.cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdoutBuffer = "";
    let stderrBuffer = "";
    this.#setState(thread.id, {
      threadId: thread.id,
      activeRunId: runId,
      phase: "running",
      canCancel: true,
      canRetry: false,
      process: child,
      transport: "cli"
    });
    this.emit("run.started", { threadId: thread.id, runId, transport: "cli" });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer = this.#handleOutput(thread.id, runId, `${stdoutBuffer}${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk;
      this.emit("run.output", { threadId: thread.id, runId, stream: "stderr", text: chunk });
    });

    child.on("error", (error) => {
      this.#setState(thread.id, {
        threadId: thread.id,
        activeRunId: null,
        phase: "failed",
        canCancel: false,
        canRetry: this.lastInputs.has(thread.id)
      });
      this.emit("run.failed", { threadId: thread.id, runId, error: error.message });
    });

    child.on("exit", (code, signal) => {
      if (stdoutBuffer.trim()) this.#parseOutputLine(thread.id, runId, stdoutBuffer.trim());
      const phase = code === 0 ? "idle" : signal ? "cancelled" : "failed";
      this.#setState(thread.id, {
        threadId: thread.id,
        activeRunId: null,
        phase,
        canCancel: false,
        canRetry: this.lastInputs.has(thread.id),
        lastError: phase === "failed" ? stderrBuffer.trim() || `Codex CLI exited with code ${code}` : null
      });
      this.emit(code === 0 ? "run.finished" : "run.failed", { threadId: thread.id, runId, code, signal });
    });

    return this.getState(thread.id);
  }

  #clearRun(threadId) {
    this.#setState(threadId, {
      threadId,
      activeRunId: null,
      phase: "idle",
      canCancel: false,
      canRetry: this.lastInputs.has(threadId)
    });
  }

  #handleOutput(threadId, runId, chunk) {
    const lines = chunk.split("\n");
    const remainder = lines.pop() || "";
    for (const line of lines) {
      this.#parseOutputLine(threadId, runId, line);
    }
    return remainder;
  }

  #parseOutputLine(threadId, runId, line) {
    if (!line.trim()) return;
    try {
      this.emit("run.event", { threadId, event: JSON.parse(line) });
    } catch {
      this.emit("run.output", { threadId, runId, stream: "stdout", text: line });
    }
  }
}
