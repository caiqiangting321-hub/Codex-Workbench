import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { cleanChatText } from "./chatText.js";
import { CODEX_REMOTE_MODEL } from "./config.js";

const DEFAULT_URL = process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:8790";

export class CodexAppServerClient extends EventEmitter {
  constructor({ url = DEFAULT_URL } = {}) {
    super();
    this.url = url;
    this.ws = null;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.initialized = false;
    this.connecting = null;
  }

  async ensureConnected() {
    if (this.ws?.readyState === WebSocket.OPEN && this.initialized) return this;
    if (this.connecting) return this.connecting;
    this.connecting = this.#connectWithSpawnFallback().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async #connectWithSpawnFallback() {
    try {
      await this.#connect();
    } catch {
      this.#startLocalServer();
      await wait(500);
      await this.#connect();
    }
    await this.request("initialize", {
      clientInfo: { name: "codex-mobile-workbench", title: "CODEX WORKBENCH", version: "0.1.0" },
      capabilities: { experimentalApi: true }
    });
    this.initialized = true;
    return this;
  }

  #connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Timed out connecting to Codex app-server at ${this.url}`));
      }, 2500);

      ws.once("open", () => {
        clearTimeout(timer);
        this.ws = ws;
        this.initialized = false;
        ws.on("message", (data) => this.#handleMessage(String(data)));
        ws.on("close", () => {
          this.initialized = false;
          this.ws = null;
          for (const { reject: rejectPending } of this.pending.values()) {
            rejectPending(new Error("Codex app-server connection closed"));
          }
          this.pending.clear();
        });
        resolve();
      });

      ws.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  #startLocalServer() {
    if (this.child) return;
    const url = new URL(this.url);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      throw new Error(`Refusing to spawn Codex app-server for non-loopback URL ${this.url}`);
    }
    this.child = spawn("codex", ["app-server", "--listen", this.url], {
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"]
    });
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk) => this.emit("diagnostic", chunk));
    this.child.on("exit", () => {
      this.child = null;
      this.initialized = false;
    });
  }

  #handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.emit("notification", { method: "raw", params: raw });
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    if (message.method) this.emit("notification", message);
  }

  async request(method, params) {
    await this.ensureSocketOpen();
    const id = String(this.nextId++);
    const payload = { id, method, params };
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 30000).unref();
    });
    this.ws.send(JSON.stringify(payload));
    return promise;
  }

  async ensureSocketOpen() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    await this.ensureConnected();
  }

  async resumeThread(thread) {
    await this.ensureConnected();
    return this.request("thread/resume", {
      threadId: thread.id,
      cwd: thread.cwd || null,
      persistExtendedHistory: true
    });
  }

  async startTurn(threadId, text, model = CODEX_REMOTE_MODEL) {
    await this.ensureConnected();
    return this.request("turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
      model
    });
  }

  async interrupt(threadId, turnId) {
    await this.ensureConnected();
    return this.request("turn/interrupt", { threadId, turnId });
  }

  async threadMessages(threadId) {
    await this.ensureConnected();
    const response = await this.request("thread/turns/list", { threadId });
    return turnsToMessages(response?.data || [], threadId);
  }

  status() {
    return {
      url: this.url,
      connected: this.ws?.readyState === WebSocket.OPEN,
      spawned: Boolean(this.child),
      initialized: this.initialized
    };
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textFromUserContent(content = []) {
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function turnsToMessages(turns, threadId) {
  const messages = [];
  for (const turn of turns.toReversed()) {
    const createdAt = turn.startedAt ? new Date(turn.startedAt * 1000).toISOString() : new Date(0).toISOString();
    const completedAt = turn.completedAt ? new Date(turn.completedAt * 1000).toISOString() : createdAt;
    for (const item of turn.items || []) {
      if (item.type === "userMessage") {
        const text = cleanChatText(textFromUserContent(item.content));
        if (!text.trim()) continue;
        messages.push({
          id: `app:${turn.id}:${item.id || messages.length}:user`,
          threadId,
          role: "user",
          kind: "message",
          text,
          createdAt
        });
      }
      if (item.type === "agentMessage" && item.text?.trim()) {
        messages.push({
          id: `app:${turn.id}:${item.id || messages.length}:assistant`,
          threadId,
          role: "assistant",
          kind: "message",
          text: item.text,
          createdAt: completedAt
        });
      }
    }
  }
  return messages;
}
