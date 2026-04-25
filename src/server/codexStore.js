import fs from "node:fs/promises";
import path from "node:path";
import { codexPath } from "./config.js";
import { parseRolloutFile } from "./rolloutParser.js";
import { sqliteJson } from "./sqlite.js";

const stateDb = codexPath("state_5.sqlite");
const sessionIndexPath = codexPath("session_index.jsonl");
const MAX_SESSION_META_BYTES = 256 * 1024;

function basenameLabel(cwd) {
  const base = path.basename(cwd || "");
  return base || cwd || "Unknown Project";
}

async function readSessionIndex() {
  try {
    const raw = await fs.readFile(sessionIndexPath, "utf8");
    const names = new Map();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.id && item.thread_name) names.set(item.id, item.thread_name);
      } catch {
        // Ignore malformed index lines; SQLite remains the source of truth.
      }
    }
    return names;
  } catch {
    return new Map();
  }
}

function toIso(value) {
  const number = Number(value || 0);
  if (!number) return new Date(0).toISOString();
  return new Date(number > 9999999999 ? number : number * 1000).toISOString();
}

async function readFirstJsonLine(filePath) {
  if (!filePath) return null;
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const chunks = [];
    let total = 0;
    while (total < MAX_SESSION_META_BYTES) {
      const buffer = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newlineAt = chunk.indexOf(10);
      if (newlineAt >= 0) {
        chunks.push(chunk.subarray(0, newlineAt));
        break;
      }
      chunks.push(chunk);
      total += bytesRead;
    }
    const line = Buffer.concat(chunks).toString("utf8").trim();
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readSubagentMeta(row) {
  if (!row.agent_nickname && !row.agent_role) return {};
  const firstLine = await readFirstJsonLine(row.rollout_path);
  const spawn = firstLine?.payload?.source?.subagent?.thread_spawn;
  return {
    parentThreadId: spawn?.parent_thread_id || null,
    subagentDepth: Number.isFinite(Number(spawn?.depth)) ? Number(spawn.depth) : null,
    agentNickname: row.agent_nickname || firstLine?.payload?.agent_nickname || spawn?.agent_nickname || "",
    agentRole: row.agent_role || firstLine?.payload?.agent_role || spawn?.agent_role || ""
  };
}

async function rowToThread(row, names) {
  const subagent = await readSubagentMeta(row);
  const isSubagent = Boolean(subagent.parentThreadId || subagent.agentNickname || subagent.agentRole);
  return {
    id: row.id,
    title: names.get(row.id) || row.title || "Untitled Thread",
    cwd: row.cwd,
    updatedAt: toIso(row.updated_at_ms || row.updated_at),
    status: "idle",
    rolloutPath: row.rollout_path,
    gitBranch: row.git_branch || "",
    model: row.model || "",
    parentThreadId: subagent.parentThreadId,
    isSubagent,
    agentNickname: subagent.agentNickname || "",
    agentRole: subagent.agentRole || "",
    subagentDepth: subagent.subagentDepth,
    subagents: []
  };
}

function attachSubagents(threads, { includeSubagents = false } = {}) {
  const byId = new Map(threads.map((thread) => [thread.id, { ...thread, subagents: [] }]));
  const roots = [];

  for (const thread of byId.values()) {
    if (thread.parentThreadId && byId.has(thread.parentThreadId)) {
      byId.get(thread.parentThreadId).subagents.push(thread);
    } else if (!thread.isSubagent || includeSubagents) {
      roots.push(thread);
    }
  }

  for (const thread of byId.values()) {
    thread.subagents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  return roots.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function flattenThreads(threads) {
  const flattened = [];
  for (const thread of threads) {
    flattened.push(thread);
    flattened.push(...flattenThreads(thread.subagents || []));
  }
  return flattened;
}

export async function listThreads(projectCwd, options = {}) {
  const names = await readSessionIndex();
  const rows = await sqliteJson(
    stateDb,
    `select id, title, cwd, updated_at_ms, updated_at, rollout_path, archived, git_branch, model, agent_nickname, agent_role from threads where archived = 0 order by coalesce(updated_at_ms, updated_at * 1000) desc, id desc`
  );

  const threads = await Promise.all(rows.filter((row) => !projectCwd || row.cwd === projectCwd).map((row) => rowToThread(row, names)));
  return attachSubagents(threads, options);
}

export async function getThread(threadId) {
  const threads = await listThreads(null, { includeSubagents: true });
  return flattenThreads(threads).find((thread) => thread.id === threadId) || null;
}

export async function listProjects() {
  const threads = await listThreads();
  const byCwd = new Map();

  for (const thread of threads) {
    if (!byCwd.has(thread.cwd)) {
      byCwd.set(thread.cwd, {
        cwd: thread.cwd,
        label: basenameLabel(thread.cwd),
        lastUpdatedAt: thread.updatedAt,
        threadCount: 0,
        recentThreads: []
      });
    }
    const project = byCwd.get(thread.cwd);
    project.threadCount += 1;
    project.recentThreads.push(thread);
    if (new Date(thread.updatedAt) > new Date(project.lastUpdatedAt)) {
      project.lastUpdatedAt = thread.updatedAt;
    }
  }

  return Array.from(byCwd.values()).sort((a, b) => new Date(b.lastUpdatedAt) - new Date(a.lastUpdatedAt));
}

export async function getMessages(threadId) {
  const thread = await getThread(threadId);
  if (!thread) return null;
  return parseRolloutFile(thread.rolloutPath, thread.id);
}

export async function getSystemStatus(runStates = []) {
  const [dbStat, indexStat] = await Promise.allSettled([fs.stat(stateDb), fs.stat(sessionIndexPath)]);
  return {
    hostOnline: true,
    codexHome: codexPath(),
    stateDbReadable: dbStat.status === "fulfilled",
    sessionIndexReadable: indexStat.status === "fulfilled",
    activeRuns: runStates.length,
    checkedAt: new Date().toISOString()
  };
}
