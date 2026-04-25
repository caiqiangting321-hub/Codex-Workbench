import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { CodexAppServerClient } from "./appServerClient.js";
import { CODEX_HOME, CODEX_SEND_MODE, HOST, PASSWORD, PORT, codexPath, isLoopbackHost } from "./config.js";
import { getMessages, getSystemStatus, getThread, listProjects, listThreads } from "./codexStore.js";
import { openCodexThreadInDesktop } from "./desktopDriver.js";
import { passwordStatus, setPassword, verifyPassword } from "./passwordStore.js";
import { RunManager } from "./runManager.js";
import { detectRolloutChanges } from "./rolloutChangeDetector.js";
import { inferDesktopState } from "./threadState.js";
import { issueTokenPair, refreshAccessToken, revokeAllTokens, validateAccessToken } from "./tokens.js";
import { formatPromptWithAttachments, saveBase64Upload } from "./uploads.js";

const AVAILABLE_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2"
];
const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024;
const UPLOAD_JSON_BODY_LIMIT = 40 * 1024 * 1024;

function modelPayload(manager, thread = null) {
  const model = manager.getModel(thread?.id || null, thread?.model || "");
  return {
    model,
    availableModels: Array.from(new Set([model, ...AVAILABLE_MODELS]))
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../../dist");
const appServerClient = new CodexAppServerClient();
const runManager = new RunManager({ getThread, appServerClient });
const clients = new Set();

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req, { maxBytes = DEFAULT_JSON_BODY_LIMIT } = {}) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) {
        tooLarge = true;
        raw = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function getBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function requireAuth(req, res) {
  if (validateAccessToken(getBearer(req))) return true;
  sendJson(res, 401, { error: "Unauthorized" });
  return false;
}

function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, payload, at: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

function mergeMessages(...messageLists) {
  const seen = new Set();
  return messageLists
    .flat()
    .filter((message) => {
      const createdAt = new Date(message.createdAt).getTime();
      const secondBucket = Number.isFinite(createdAt) ? Math.floor(createdAt / 1000) : 0;
      const key = `${message.role}:${message.kind}:${message.text || message.outputPreview || ""}:${secondBucket}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function codexCliAvailable() {
  return new Promise((resolve) => {
    execFile("codex", ["--version"], { timeout: 5000 }, (error, stdout) => {
      resolve({ available: !error, version: stdout.trim() });
    });
  });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(distDir, requested);
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    const target = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    res.writeHead(200, {
      "Content-Type": contentType(target),
      "Cache-Control": "no-store, max-age=0"
    });
    fs.createReadStream(target).pipe(res);
  } catch {
    const indexPath = path.join(distDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("Build the PWA with npm run build, or run npm run dev for Vite.");
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/octet-stream";
}

export async function createApiHandler({ runManagerInstance = runManager } = {}) {
  return async function apiHandler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url.pathname, url.searchParams, runManagerInstance);
        return;
      }
      await serveStatic(req, res, url.pathname);
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message || "Internal server error" });
    }
  };
}

const server = http.createServer(await createApiHandler());

async function handleApi(req, res, pathname, searchParams, manager) {
  if (req.method === "GET" && pathname === "/api/auth/status") {
    sendJson(res, 200, await passwordStatus());
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/setup") {
    const status = await passwordStatus();
    if (!status.setupRequired) {
      sendJson(res, 409, { error: "Password is already configured" });
      return;
    }
    const body = await readBody(req);
    await setPassword(body.password);
    revokeAllTokens();
    sendJson(res, 201, issueTokenPair());
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const status = await passwordStatus();
    if (status.setupRequired) {
      sendJson(res, 428, { error: "Create a password before logging in", setupRequired: true });
      return;
    }
    if (!(await verifyPassword(body.password))) {
      sendJson(res, 401, { error: "Wrong password" });
      return;
    }
    sendJson(res, 200, issueTokenPair());
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/refresh") {
    const body = await readBody(req);
    const refreshed = refreshAccessToken(body.refreshToken);
    if (!refreshed) {
      sendJson(res, 401, { error: "Invalid refresh token" });
      return;
    }
    sendJson(res, 200, refreshed);
    return;
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "POST" && pathname === "/api/auth/password") {
    const body = await readBody(req);
    if (!(await verifyPassword(body.currentPassword))) {
      sendJson(res, 401, { error: "Current password is wrong" });
      return;
    }
    await setPassword(body.newPassword);
    revokeAllTokens();
    sendJson(res, 200, issueTokenPair());
    return;
  }

  if (req.method === "GET" && pathname === "/api/projects") {
    sendJson(res, 200, await listProjects());
    return;
  }

  if (req.method === "GET" && pathname === "/api/threads") {
    sendJson(res, 200, await listThreads(searchParams.get("project") || ""));
    return;
  }

  if (req.method === "POST" && pathname === "/api/uploads") {
    const body = await readBody(req, { maxBytes: UPLOAD_JSON_BODY_LIMIT });
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) {
      sendJson(res, 400, { error: "No files uploaded" });
      return;
    }
    const uploads = [];
    for (const file of files) uploads.push(await saveBase64Upload(file));
    sendJson(res, 201, { uploads });
    return;
  }

  const threadMatch = pathname.match(/^\/api\/threads\/([^/]+)(?:\/([^/]+))?$/);
  if (threadMatch) {
    const threadId = decodeURIComponent(threadMatch[1]);
    const action = threadMatch[2] || "";

    if (req.method === "GET" && !action) {
      const thread = await getThread(threadId);
      if (!thread) {
        sendJson(res, 404, { error: "Thread not found" });
        return;
      }
      const messages = await getMessages(threadId);
      const state = inferDesktopState(threadId, messages || [], manager.getState(threadId));
      sendJson(res, 200, { thread: { ...thread, effectiveModel: manager.getModel(threadId, thread.model) }, state });
      return;
    }

    if (action === "model") {
      const thread = await getThread(threadId);
      if (!thread) {
        sendJson(res, 404, { error: "Thread not found" });
        return;
      }
      if (req.method === "GET") {
        sendJson(res, 200, modelPayload(manager, thread));
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        manager.setModel(body.model, threadId);
        sendJson(res, 200, modelPayload(manager, thread));
        return;
      }
    }

    if (req.method === "GET" && action === "messages") {
      const messages = await getMessages(threadId);
      if (!messages) {
        sendJson(res, 404, { error: "Thread not found" });
        return;
      }
      let appServerMessages = [];
      try {
        appServerMessages = await appServerClient.threadMessages(threadId);
      } catch {
        // Rollout JSONL remains the baseline history source when app-server is unavailable.
      }
      sendJson(res, 200, mergeMessages(messages, appServerMessages));
      return;
    }

    if (req.method === "POST" && action === "send") {
      const body = await readBody(req);
      const state = await manager.send(threadId, formatPromptWithAttachments(body.message || "", body.attachments || []));
      sendJson(res, 202, state);
      return;
    }

    if (req.method === "POST" && action === "cancel") {
      sendJson(res, 200, await manager.cancel(threadId));
      return;
    }

    if (req.method === "POST" && action === "retry") {
      const state = await manager.retry(threadId);
      sendJson(res, 202, state);
      return;
    }

    if (req.method === "POST" && action === "open-desktop") {
      const thread = await getThread(threadId);
      if (!thread) {
        sendJson(res, 404, { error: "Thread not found" });
        return;
      }
      sendJson(res, 200, await openCodexThreadInDesktop(threadId));
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/system/status") {
    const status = await getSystemStatus(manager.getActiveStates());
    sendJson(res, 200, { ...status, sendMode: CODEX_SEND_MODE, model: manager.getModel(), codexCli: await codexCliAvailable(), appServer: appServerClient.status() });
    return;
  }

  if (pathname === "/api/system/model") {
    if (req.method === "GET") {
      sendJson(res, 200, modelPayload(manager));
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      manager.setModel(body.model);
      sendJson(res, 200, modelPayload(manager));
      return;
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (url.pathname !== "/ws" || !validateAccessToken(url.searchParams.get("token"))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "system.connected", payload: { codexHome: CODEX_HOME }, at: new Date().toISOString() }));
    ws.on("close", () => clients.delete(ws));
  });
});

for (const eventName of ["status", "model.changed", "run.started", "run.finished", "run.failed", "run.event", "run.output"]) {
  runManager.on(eventName, (payload) => {
    const type = eventName === "status" ? "thread.status" : eventName;
    broadcast(type, payload);
  });
}

appServerClient.on("notification", (message) => {
  const { method, params } = message;
  if (method === "turn/completed") {
    runManager.completeAppServerTurn(params.threadId, params.turn, params.turn?.status === "failed");
    broadcast("thread.updated", { threadId: params.threadId });
    return;
  }
  if (method === "error") {
    runManager.completeAppServerTurn(params.threadId, { id: params.turnId, status: "failed" }, true);
    broadcast("run.failed", { threadId: params.threadId, turnId: params.turnId, error: params.error });
    return;
  }
  if (method === "item/agentMessage/delta") return;
  if (method === "thread/status/changed") {
    broadcast("thread.status", { threadId: params.threadId, state: runManager.getState(params.threadId), appStatus: params.status });
  }
});

let lastStateMtime = 0;
let rolloutMtimes = new Map();
setInterval(async () => {
  try {
    const stat = await fsp.stat(codexPath("state_5.sqlite"));
    if (stat.mtimeMs !== lastStateMtime) {
      lastStateMtime = stat.mtimeMs;
      broadcast("project.updated");
      broadcast("thread.updated");
    }
  } catch {
    // The status endpoint reports missing state files; the sync loop can stay quiet.
  }
}, 2000).unref();

setInterval(async () => {
  try {
    const threads = await listThreads();
    const mtimes = new Map();
    await Promise.all(
      threads.map(async (thread) => {
        if (!thread.rolloutPath) return;
        try {
          const stat = await fsp.stat(thread.rolloutPath);
          mtimes.set(thread.rolloutPath, stat.mtimeMs);
        } catch {
          // Some old index entries can point at removed rollout files; ignore them.
        }
      })
    );
    const result = detectRolloutChanges(rolloutMtimes, threads, mtimes);
    rolloutMtimes = result.next;
    for (const change of result.changed) {
      broadcast("thread.updated", change);
      broadcast("project.updated", { cwd: change.cwd });
    }
  } catch {
    // Keep the polling loop alive; status endpoints surface readable state separately.
  }
}, 1000).unref();

server.listen(PORT, HOST, () => {
  passwordStatus()
    .then((status) => {
      if (status.setupRequired) {
        console.warn("No remote password is configured; the first web visit must create one.");
      }
      if (!isLoopbackHost(HOST) && status.setupRequired) {
        console.warn("Non-loopback serving is waiting for first-run password setup.");
      }
    })
    .catch(() => {});
  console.log(`Codex mobile workbench listening on http://${HOST}:${PORT}`);
});
