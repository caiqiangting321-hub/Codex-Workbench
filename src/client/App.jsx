import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  FolderGit2,
  FolderPlus,
  LockKeyhole,
  ListFilter,
  Loader2,
  LogOut,
  Maximize2,
  MessageSquare,
  Monitor,
  Moon,
  Paperclip,
  PencilLine,
  RefreshCw,
  Search,
  Send,
  Square,
  Sun,
  TerminalSquare,
  Wifi,
  WifiOff,
  Wrench
} from "lucide-react";
import { ApiClient, clearTokens, loadStoredTokens, storeTokens } from "./api.js";
import { applyComposerSuggestion, filterComposerSuggestions, getComposerTrigger } from "./composerAssist.js";
import { mergeFetchedMessagesWithLocalDrafts } from "./messageMerge.js";
import { useWorkbenchSocket } from "./useWorkbenchSocket.js";

const EMPTY_STATE = {
  threadId: null,
  activeRunId: null,
  phase: "idle",
  canCancel: false,
  canRetry: false
};

const THEME_MODES = ["auto", "light", "dark"];

function loadStoredThemeMode() {
  try {
    const value = localStorage.getItem("codex-workbench-theme");
    return THEME_MODES.includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

function storeThemeMode(value) {
  try {
    localStorage.setItem("codex-workbench-theme", value);
  } catch {
    // Theme selection is a convenience preference; ignore storage failures.
  }
}

function useVisualViewportHeight() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frame = 0;
    const timers = new Set();
    const updateViewportHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const visualViewport = window.visualViewport;
        const viewportHeight = visualViewport?.height || window.innerHeight;
        const viewportWidth = visualViewport?.width || window.innerWidth;
        const viewportTop = visualViewport?.offsetTop || 0;
        const viewportLeft = visualViewport?.offsetLeft || 0;
        document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
        document.documentElement.style.setProperty("--app-width", `${Math.round(viewportWidth)}px`);
        document.documentElement.style.setProperty("--app-top", `${Math.round(viewportTop)}px`);
        document.documentElement.style.setProperty("--app-left", `${Math.round(viewportLeft)}px`);
      });
    };
    const updateViewportHeightSoon = () => {
      updateViewportHeight();
      for (const delay of [80, 240, 480]) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          updateViewportHeight();
        }, delay);
        timers.add(timer);
      }
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeightSoon);
    window.addEventListener("orientationchange", updateViewportHeightSoon);
    window.addEventListener("focusin", updateViewportHeightSoon);
    window.addEventListener("focusout", updateViewportHeightSoon);
    window.visualViewport?.addEventListener("resize", updateViewportHeightSoon);
    window.visualViewport?.addEventListener("scroll", updateViewportHeightSoon);

    return () => {
      cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("resize", updateViewportHeightSoon);
      window.removeEventListener("orientationchange", updateViewportHeightSoon);
      window.removeEventListener("focusin", updateViewportHeightSoon);
      window.removeEventListener("focusout", updateViewportHeightSoon);
      window.visualViewport?.removeEventListener("resize", updateViewportHeightSoon);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeightSoon);
    };
  }, []);
}

function usePreventHorizontalPagePan() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let startX = 0;
    let startY = 0;
    const onTouchStart = (event) => {
      const touch = event.touches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const onTouchMove = (event) => {
      const touch = event.touches?.[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) > Math.abs(deltaY) + 6) {
        event.preventDefault();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
}

function formatRelative(value) {
  if (!value) return "Never";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown";
  const delta = Date.now() - time;
  const minute = 60 * 1000;
  if (delta < minute) return "Just now";
  if (delta < 60 * minute) return `${Math.floor(delta / minute)}m ago`;
  if (delta < 24 * 60 * minute) return `${Math.floor(delta / (60 * minute))}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(time);
}

function formatDesktopRelative(value) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const delta = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "刚刚";
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟`;
  if (delta < day) return `${Math.floor(delta / hour)} 小时`;
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天`;
  return `${Math.floor(delta / (7 * day))} 周`;
}

function projectPathLabel(cwd = "") {
  const parts = cwd.split("/").filter(Boolean);
  return parts.length ? parts.slice(-2).join("/") : cwd || "Unknown path";
}

function recentConversationThreads(projects) {
  const seen = new Set();
  return projects
    .flatMap((project) => project.recentThreads || [])
    .filter((thread) => {
      if (!thread?.id || seen.has(thread.id)) return false;
      seen.add(thread.id);
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function agentText(thread) {
  return [thread?.title, thread?.agentNickname, thread?.agentRole].map(stringifyVisibleValue).join(" ").toLowerCase();
}

function filterSubagents(subagents = [], query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return subagents;
  return subagents.filter((thread) => agentText(thread).includes(normalizedQuery));
}

function buildMentionSuggestions({ detail, modelInfo }) {
  const thread = detail?.thread || {};
  const cwd = thread.cwd || "";
  const title = stringifyVisibleValue(thread.title || "当前线程");
  const model = stringifyVisibleValue(thread.effectiveModel || thread.model || modelInfo.model || "");
  const suggestions = [
    {
      id: "thread",
      label: "当前线程",
      description: title,
      keywords: ["thread", "聊天", title],
      insertText: `@当前线程 ${title}`
    },
    {
      id: "project",
      label: "当前项目",
      description: projectPathLabel(cwd),
      keywords: ["project", "项目", cwd],
      insertText: `@当前项目 ${cwd || projectPathLabel(cwd)}`
    },
    {
      id: "model",
      label: "当前模型",
      description: model || "未同步模型",
      keywords: ["model", "模型", model],
      insertText: `@当前模型 ${model || "未同步模型"}`
    },
    {
      id: "upload",
      label: "上传附件",
      description: "选择图片、PDF 或文本文件",
      keywords: ["attach", "file", "image", "附件", "图片"],
      insertText: "@上传附件 "
    }
  ];
  return suggestions;
}

function buildSlashSuggestions({ busy, onCancel, onSend, openFilePicker }) {
  return [
    {
      id: "status",
      label: "/status",
      description: "询问当前任务状态",
      keywords: ["状态", "运行", "status"],
      insertText: "现在这个任务运行到哪里了？"
    },
    {
      id: "retry",
      label: "/retry",
      description: "让 Codex 重新尝试上一轮",
      keywords: ["重试", "retry"],
      insertText: "请重试上一轮，并避免重复已经成功的步骤。"
    },
    {
      id: "cancel",
      label: "/cancel",
      description: busy ? "停止当前回复" : "当前没有运行中的回复",
      keywords: ["停止", "取消", "stop", "cancel"],
      disabled: !busy,
      action: onCancel
    },
    {
      id: "attach",
      label: "/attach",
      description: "选择附件",
      keywords: ["附件", "图片", "file", "image"],
      action: openFilePicker
    },
    {
      id: "model",
      label: "/model",
      description: "询问或检查当前模型",
      keywords: ["模型", "model"],
      insertText: "当前这个聊天使用的模型是什么？"
    }
  ].map((item) => ({
    ...item,
    action:
      item.action ||
      (() => {
        if (item.insertText) onSend(item.insertText, []);
      })
  }));
}

function eventType(event) {
  return event?.type || event?.event || event?.name;
}

function isBlockingRunState(runState) {
  const phase = stringifyVisibleValue(runState?.phase || "idle");
  return Boolean(runState?.activeRunId) && ["starting", "resuming", "running", "cancelling"].includes(phase);
}

function liveStatusLabel({ sending, awaitingReply, runState }) {
  const phase = stringifyVisibleValue(runState?.phase || "idle");
  if (awaitingReply?.stage === "synced") return "回复已同步";
  if (awaitingReply?.stage === "delivered") return "已发送到桌面，等待回复";
  if (awaitingReply?.stage === "submitted") return "网页已提交";
  if (phase === "starting") return "正在准备";
  if (phase === "sending-to-desktop" || sending) return "正在发送到桌面";
  if (phase === "resuming") return "正在恢复对话";
  if (phase === "running") return "正在执行";
  if (phase === "cancelling") return "正在取消";
  if (awaitingReply) return "正在思考";
  return "";
}

function isTerminalRunState(runState) {
  const phase = stringifyVisibleValue(runState?.phase || "idle");
  return runState?.rolloutStatus === "complete" || ["cancelled", "failed"].includes(phase);
}

function makeOptimisticUserMessage(threadId, text) {
  return {
    id: `local:${threadId}:${Date.now()}`,
    threadId,
    role: "user",
    kind: "message",
    text,
    createdAt: new Date().toISOString(),
    pending: true
  };
}

function normalizeMessageText(value) {
  return stringifyVisibleValue(value || "").trim();
}

function hasAssistantReplyAfterPendingUser(messages, pendingReply) {
  if (!pendingReply?.threadId || !Array.isArray(messages)) return false;
  let sawPendingUser = false;
  const targetText = normalizeMessageText(pendingReply.userText);
  for (const message of messages) {
    if (message?.threadId !== pendingReply.threadId) continue;
    if (!sawPendingUser && message?.role === "user" && normalizeMessageText(message.text) === targetText) {
      sawPendingUser = true;
      continue;
    }
    if (sawPendingUser && message?.role === "assistant" && message?.kind === "message" && normalizeMessageText(message.text)) {
      return true;
    }
  }
  return false;
}

function isRenderableTraceMessage(message) {
  const isTool = message?.kind?.startsWith("tool") || message?.role === "tool";
  const isRunState = message?.kind === "run_state";
  return Boolean(isTool && !isRunState && message?.activityLabel);
}

function buildMessageDisplayItems(messages) {
  const items = [];
  let latestTrace = null;
  let latestTraceAttached = false;

  for (const message of messages) {
    if (message?.role === "user" && message?.kind === "message") {
      latestTrace = null;
      latestTraceAttached = false;
      items.push({ type: "message", message, trace: null });
      continue;
    }
    if (isRenderableTraceMessage(message)) {
      latestTrace = message;
      latestTraceAttached = false;
      continue;
    }
    if (message?.kind === "run_state") continue;
    if (message?.role === "assistant" && message?.kind === "message") {
      items.push({
        type: "message",
        message,
        trace: latestTrace
      });
      latestTraceAttached = Boolean(latestTrace);
      continue;
    }
    items.push({ type: "message", message, trace: null });
  }

  if (latestTrace && !latestTraceAttached) {
    items.push({ type: "pending-trace", trace: latestTrace });
  }

  return items;
}

function fileToUploadPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error(`Failed to read ${file.name}`)));
    reader.addEventListener("load", () => {
      const dataUrl = String(reader.result || "");
      const dataBase64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : "";
      resolve({ name: file.name, type: file.type || "application/octet-stream", dataBase64 });
    });
    reader.readAsDataURL(file);
  });
}

export default function App() {
  useVisualViewportHeight();
  usePreventHorizontalPagePan();

  const [tokens, setTokens] = useState(() => loadStoredTokens());
  const [projects, setProjects] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadDetail, setThreadDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(null);
  const [modelInfo, setModelInfo] = useState({ model: "", availableModels: [] });
  const [screen, setScreen] = useState("projects");
  const [themeMode, setThemeMode] = useState(() => loadStoredThemeMode());
  const [authStatus, setAuthStatus] = useState(null);
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState({ projects: false, threads: false, detail: false, sending: false });
  const [pendingReplies, setPendingReplies] = useState({});
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const pendingRepliesRef = useRef({});
  const activeProjectCwd = selectedProject?.cwd || "";
  const deferredMessages = useDeferredValue(messages);
  const selectedAwaitingReply = selectedThreadId ? pendingReplies[selectedThreadId] || null : null;

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    storeThemeMode(themeMode);
  }, [themeMode]);

  function cycleThemeMode() {
    setThemeMode((current) => THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length]);
  }

  function setPendingReply(threadId, pendingReply) {
    pendingRepliesRef.current = { ...pendingRepliesRef.current, [threadId]: pendingReply };
    setPendingReplies(pendingRepliesRef.current);
  }

  function clearPendingReply(threadId) {
    const next = { ...pendingRepliesRef.current };
    delete next[threadId];
    pendingRepliesRef.current = next;
    setPendingReplies(next);
  }

  const api = useMemo(
    () =>
      new ApiClient({
        getAccessToken: () => tokens?.accessToken,
        getRefreshToken: () => tokens?.refreshToken,
        onTokenRefresh: (refreshed) => {
          const nextTokens = { ...tokens, ...refreshed };
          storeTokens(nextTokens);
          setTokens(nextTokens);
        },
        onUnauthorized: () => {
          clearTokens();
          setTokens(null);
        }
      }),
    [tokens]
  );

  const signOut = useCallback(() => {
    clearTokens();
    setTokens(null);
    setProjects([]);
    setThreads([]);
    setSelectedProject(null);
    setSelectedThreadId(null);
    setThreadDetail(null);
    setMessages([]);
    setModelInfo({ model: "", availableModels: [] });
    pendingRepliesRef.current = {};
    setPendingReplies({});
    setScreen("projects");
  }, []);

  const loadProjects = useCallback(async () => {
    if (!tokens?.accessToken) return;
    setLoading((current) => ({ ...current, projects: true }));
    try {
      const nextProjects = await api.projects();
      startTransition(() => setProjects(nextProjects));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading((current) => ({ ...current, projects: false }));
    }
  }, [api, tokens?.accessToken]);

  const loadThreads = useCallback(
    async (projectCwd = activeProjectCwd) => {
      if (!tokens?.accessToken || !projectCwd) return;
      setLoading((current) => ({ ...current, threads: true }));
      try {
        const nextThreads = await api.threads(projectCwd);
        startTransition(() => setThreads(nextThreads));
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading((current) => ({ ...current, threads: false }));
      }
    },
    [activeProjectCwd, api, tokens?.accessToken]
  );

  const loadThreadDetail = useCallback(
    async (threadId = selectedThreadId) => {
      if (!tokens?.accessToken || !threadId) return;
      setLoading((current) => ({ ...current, detail: true }));
      try {
        const [detail, nextMessages] = await Promise.all([api.thread(threadId), api.messages(threadId)]);
        const mergedMessages = mergeFetchedMessagesWithLocalDrafts(nextMessages, messages, threadId);
        startTransition(() => {
          setThreadDetail(detail);
          setMessages(mergedMessages);
        });
        setModelInfo((current) => ({
          ...current,
          model: detail?.thread?.effectiveModel || detail?.thread?.model || current.model
        }));
        const pendingReply = pendingRepliesRef.current[threadId];
        if (hasAssistantReplyAfterPendingUser(mergedMessages, pendingReply)) {
          setPendingReply(threadId, { ...pendingRepliesRef.current[threadId], stage: "synced" });
          window.setTimeout(() => {
            if (pendingRepliesRef.current[threadId]?.stage === "synced") clearPendingReply(threadId);
          }, 1800);
        } else if (pendingReply && isTerminalRunState(detail?.state)) {
          clearPendingReply(threadId);
        }
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading((current) => ({ ...current, detail: false }));
      }
    },
    [api, messages, selectedThreadId, tokens?.accessToken]
  );

  const refreshStatus = useCallback(async () => {
    if (!tokens?.accessToken) return;
    try {
      setStatus(await api.status());
    } catch (err) {
      setError(err.message);
    }
  }, [api, tokens?.accessToken]);

  const loadModelInfo = useCallback(async () => {
    if (!tokens?.accessToken) return;
    try {
      setModelInfo(await api.model());
    } catch (err) {
      setError(err.message);
    }
  }, [api, tokens?.accessToken]);

  const handleSocketEvent = useCallback(
    (event) => {
      const type = eventType(event);
      const threadId = event.threadId || event.thread?.id || event.payload?.threadId;
      const projectCwd = event.project?.cwd || event.cwd || event.payload?.cwd;
      const appendedMessage = event.message || event.payload?.message;
      const nextState = event.state || event.payload?.state;

      if (type === "message.appended" && threadId === selectedThreadId) {
        if (appendedMessage) setMessages((current) => [...current, appendedMessage]);
        else loadThreadDetail(threadId);
      }

      if (type === "run.event" && threadId) {
        const runEvent = event.event || event.payload?.event;
        if (runEvent?.type === "desktop.delivered" && pendingRepliesRef.current[threadId]) {
          setPendingReply(threadId, { ...pendingRepliesRef.current[threadId], stage: "delivered" });
        }
      }

      if (["thread.status", "run.started", "run.finished", "run.failed"].includes(type)) {
        if (nextState && threadId === selectedThreadId) {
          setThreadDetail((current) => (current ? { ...current, state: nextState } : current));
        }
        if (nextState && isTerminalRunState(nextState)) {
          clearPendingReply(threadId);
        }
        refreshStatus();
        if (threadId === selectedThreadId) loadThreadDetail(threadId);
        if (activeProjectCwd) loadThreads(activeProjectCwd);
      }

      if (type === "thread.updated") {
        loadProjects();
        if (!projectCwd || projectCwd === activeProjectCwd) loadThreads(activeProjectCwd);
        if (threadId === selectedThreadId) loadThreadDetail(threadId);
      }

      if (type === "project.updated") {
        loadProjects();
        if (!projectCwd || projectCwd === activeProjectCwd) loadThreads(activeProjectCwd);
      }

      if (type === "model.changed") {
        const model = event.model || event.payload?.model;
        if (model) setModelInfo((current) => ({ ...current, model }));
      }
    },
    [activeProjectCwd, loadProjects, loadThreadDetail, loadThreads, refreshStatus, selectedThreadId]
  );

  const connection = useWorkbenchSocket({ token: tokens?.accessToken, onEvent: handleSocketEvent });

  const loadAuthStatus = useCallback(async () => {
    try {
      setAuthStatus(await api.authStatus());
    } catch (err) {
      setError(err.message);
    }
  }, [api]);

  useEffect(() => {
    if (!tokens?.accessToken) return;
    loadProjects();
    loadModelInfo();
    refreshStatus();
  }, [loadModelInfo, loadProjects, refreshStatus, tokens?.accessToken]);

  useEffect(() => {
    if (tokens?.accessToken) return;
    loadAuthStatus();
  }, [loadAuthStatus, tokens?.accessToken]);

  useEffect(() => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }, 0);
  }, [deferredMessages.length, selectedThreadId]);

  async function handleLogin(password) {
    const nextTokens = await api.login(password);
    storeTokens(nextTokens);
    setTokens(nextTokens);
  }

  async function handleSetupPassword(password) {
    const nextTokens = await api.setupPassword(password);
    storeTokens(nextTokens);
    setTokens(nextTokens);
    setAuthStatus({ configured: true, setupRequired: false, source: "local" });
  }

  async function handleChangePassword(currentPassword, newPassword) {
    const nextTokens = await api.changePassword(currentPassword, newPassword);
    storeTokens(nextTokens);
    setTokens(nextTokens);
    setPasswordPanelOpen(false);
    setAuthStatus({ configured: true, setupRequired: false, source: "local" });
  }

  function openProject(project) {
    setSelectedProject(project);
    loadThreads(project.cwd);
  }

  function openThread(threadId) {
    setSelectedThreadId(threadId);
    setScreen("thread");
    loadThreadDetail(threadId);
    api.openDesktopThread(threadId).catch((err) => {
      setError(`Desktop sync failed: ${err.message}`);
    });
  }

  function openThreadFromSummary(thread) {
    const project = projects.find((item) => item.cwd === thread.cwd);
    if (project) {
      setSelectedProject(project);
      setThreads(project.recentThreads || []);
    }
    openThread(thread.id);
  }

  async function sendMessage(message, files = []) {
    const threadId = selectedThreadId;
    if (!threadId) return;
    const optimisticText = [message, ...files.map((file) => `附件：${file.name}`)].filter(Boolean).join("\n");
    const optimisticMessage = makeOptimisticUserMessage(threadId, optimisticText);
    setPendingReply(threadId, { threadId, userText: optimisticText, stage: "submitted" });
    setMessages((current) => [...current, optimisticMessage]);
    setLoading((current) => ({ ...current, sending: true }));
    try {
      const attachments = files.length ? (await api.uploadFiles(await Promise.all(files.map(fileToUploadPayload)))).uploads : [];
      await api.send(threadId, message, attachments);
      await refreshStatus();
      setError("");
    } catch (err) {
      setMessages((current) =>
        current.map((item) => (item.id === optimisticMessage.id ? { ...item, pending: false, failed: true } : item))
      );
      clearPendingReply(threadId);
      setError(err.message);
    } finally {
      setLoading((current) => ({ ...current, sending: false }));
    }
  }

  async function runAction(action) {
    if (!selectedThreadId) return;
    try {
      await api[action](selectedThreadId);
      if (action === "cancel") {
        clearPendingReply(selectedThreadId);
      }
      await loadThreadDetail(selectedThreadId);
      await refreshStatus();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeModel(model) {
    setModelInfo((current) => ({ ...current, model }));
    try {
      setModelInfo(selectedThreadId ? await api.setThreadModel(selectedThreadId, model) : await api.setModel(model));
      setError("");
    } catch (err) {
      await loadModelInfo();
      setError(err.message);
    }
  }

  if (!tokens?.accessToken && authStatus?.setupRequired) {
    return <PasswordSetupScreen onSetup={handleSetupPassword} themeMode={themeMode} onCycleTheme={cycleThemeMode} />;
  }

  if (!tokens?.accessToken) {
    return <LoginScreen onLogin={handleLogin} themeMode={themeMode} onCycleTheme={cycleThemeMode} />;
  }

  const runState = threadDetail?.state || EMPTY_STATE;

  return (
    <div className={`app-shell app-screen-${screen}`}>
      <header className="topbar">
        <button className="ghost-button mobile-back" type="button" onClick={() => setScreen("projects")}>
          <ArrowLeft size={18} />
          <span>返回</span>
        </button>
        <div>
          <p className="eyebrow">CODEX WORKBENCH</p>
          <h1>{stringifyVisibleValue(screen === "thread" ? threadDetail?.thread?.title || "对话" : "项目")}</h1>
        </div>
        <div className="top-actions">
          <ThemeToggle mode={themeMode} onClick={cycleThemeMode} />
          <ConnectionBadge connection={connection} />
          <button className="password-button" type="button" onClick={() => setPasswordPanelOpen(true)} aria-label="Password settings">
            <LockKeyhole size={18} />
            <span>密码</span>
          </button>
          <button className="icon-button" type="button" onClick={signOut} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>Dismiss</button>
        </div>
      ) : null}

      {passwordPanelOpen ? (
        <PasswordSettingsPanel onClose={() => setPasswordPanelOpen(false)} onChangePassword={handleChangePassword} />
      ) : null}

      <main className={`workspace screen-${screen}`}>
        <section className="panel projects-panel">
          <PanelHeader title="项目" isLoading={loading.projects || isPending} onRefresh={loadProjects} desktopActions />
          <ProjectList
            projects={projects}
            selectedCwd={activeProjectCwd}
            selectedThreadId={selectedThreadId}
            activeThreadId={selectedThreadId}
            activeRunState={runState}
            pendingReplies={pendingReplies}
            onSelectProject={openProject}
            onSelectThread={openThreadFromSummary}
          />
        </section>

        <section className="panel detail-panel">
          <ThreadDetail
            detail={threadDetail}
            messages={deferredMessages}
            runState={runState}
            loading={loading.detail}
            sending={loading.sending}
            awaitingReply={selectedAwaitingReply}
            modelInfo={modelInfo}
            messagesEndRef={messagesEndRef}
            onSend={sendMessage}
            onCancel={() => runAction("cancel")}
            onModelChange={changeModel}
          />
        </section>
      </main>
    </div>
  );
}

function ModelSelector({ modelInfo, onChange }) {
  const models = modelInfo.availableModels?.length ? modelInfo.availableModels : [modelInfo.model].filter(Boolean);
  if (!models.length) return null;
  return (
    <label className="model-selector">
      <span>模型</span>
      <select value={modelInfo.model || models[0]} onChange={(event) => onChange(event.target.value)}>
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoginScreen({ onLogin, themeMode, onCycleTheme }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-theme-control">
        <ThemeToggle mode={themeMode} onClick={onCycleTheme} />
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">
          <TerminalSquare size={28} />
        </div>
        <p className="eyebrow">Remote session</p>
        <h1>CODEX WORKBENCH</h1>
        <p className="muted">Sign in to inspect projects, resume threads, and control active Codex runs from your phone.</p>
        <label>
          Access password
          <input autoComplete="current-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={busy || !password.trim()} type="submit">
          {busy ? <Loader2 className="spin" size={18} /> : <Wifi size={18} />}
          Connect
        </button>
      </form>
    </main>
  );
}

function PasswordSetupScreen({ onSetup, themeMode, onCycleTheme }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 4) {
      setError("密码至少需要 4 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      await onSetup(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-theme-control">
        <ThemeToggle mode={themeMode} onClick={onCycleTheme} />
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">First run setup</p>
        <h1>设置访问密码</h1>
        <p className="muted">这是手机访问这台电脑上 Codex 工作台的本机密码。密码会以加盐哈希保存在本机，不保存明文。</p>
        <label>
          新密码
          <input autoComplete="new-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          确认新密码
          <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={busy || !password || !confirmPassword} type="submit">
          {busy ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}
          保存并进入
        </button>
      </form>
    </main>
  );
}

function PasswordSettingsPanel({ onClose, onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 4) {
      setError("新密码至少需要 4 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="password-panel" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="password-panel-header">
          <div>
            <p className="eyebrow">Security</p>
            <h2>密码设定</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="Close password settings">
            ×
          </button>
        </div>
        <p className="muted">修改后会让旧登录令牌失效，并自动使用新密码重新登录当前网页。</p>
        <label>
          当前密码
          <input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label>
          新密码
          <input autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label>
          确认新密码
          <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={busy || !currentPassword || !newPassword || !confirmPassword} type="submit">
          {busy ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}
          更新密码
        </button>
      </form>
    </div>
  );
}

function PanelHeader({ title, subtitle, isLoading, onRefresh, desktopActions = false }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {desktopActions ? (
        <div className="desktop-header-actions" aria-label={`${title} actions`}>
          <span aria-hidden="true"><Maximize2 size={16} /></span>
          <button type="button" onClick={onRefresh} disabled={isLoading} aria-label={`刷新${title}`}>
            <ListFilter className={isLoading ? "spin" : ""} size={16} />
          </button>
          <span aria-hidden="true"><FolderPlus size={16} /></span>
        </div>
      ) : (
        <button className="icon-button" type="button" onClick={onRefresh} disabled={isLoading} aria-label={`Refresh ${title}`}>
          <RefreshCw className={isLoading ? "spin" : ""} size={17} />
        </button>
      )}
    </div>
  );
}

function ConnectionBadge({ connection }) {
  const online = connection === "online";
  return (
    <span className={`connection-badge ${online ? "online" : ""}`}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connection}
    </span>
  );
}

function ThemeToggle({ mode, onClick }) {
  const config = {
    auto: { label: "跟随系统", icon: <Monitor size={16} /> },
    light: { label: "日间模式", icon: <Sun size={16} /> },
    dark: { label: "夜间模式", icon: <Moon size={16} /> }
  }[mode] || { label: "跟随系统", icon: <Monitor size={16} /> };
  return (
    <button className="theme-toggle" type="button" onClick={onClick} aria-label={`主题：${config.label}`}>
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
}

function ProjectList({ projects, selectedCwd, selectedThreadId, activeThreadId, activeRunState, pendingReplies, onSelectProject, onSelectThread }) {
  const [expandedAgentThreads, setExpandedAgentThreads] = useState(() => new Set());
  const [agentQuery, setAgentQuery] = useState("");
  if (!projects.length) return <EmptyState icon={<FolderGit2 />} title="No projects yet" body="Projects appear after Codex threads are indexed." />;
  const recentThreads = recentConversationThreads(projects);

  function toggleAgents(threadId) {
    setExpandedAgentThreads((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function renderThreadBranch(thread, extraClass = "") {
    const allSubagents = thread.subagents || [];
    const matchingSubagents = filterSubagents(allSubagents, agentQuery);
    const searchActive = Boolean(agentQuery.trim());
    const expanded = expandedAgentThreads.has(thread.id) || searchActive;
    const visibleSubagents = expanded ? matchingSubagents : [];
    const hasSubagents = allSubagents.length > 0;
    const hiddenCount = searchActive ? matchingSubagents.length : allSubagents.length;
    const isWaiting = Boolean(pendingReplies?.[thread.id]);
    const isRunning = (thread.id === activeThreadId && isBlockingRunState(activeRunState)) || thread.status === "running";

    return (
      <div className={`desktop-thread-branch ${extraClass}`} key={thread.id}>
        <button className={`desktop-thread-row ${thread.id === selectedThreadId ? "active" : ""}`} type="button" onClick={() => onSelectThread(thread)}>
          <span>{stringifyVisibleValue(thread.title || "未命名对话")}</span>
          <ThreadListMeta updatedAt={thread.updatedAt} isWaiting={isWaiting} isRunning={isRunning} />
        </button>
        {hasSubagents ? (
          <button className="agent-toggle" type="button" onClick={() => toggleAgents(thread.id)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>多 agent {hiddenCount}</span>
          </button>
        ) : null}
        {visibleSubagents.length ? (
          <div className="subagent-list">
            {visibleSubagents.map((subagent) => (
              <button className={`subagent-row ${subagent.id === selectedThreadId ? "active" : ""}`} key={subagent.id} type="button" onClick={() => onSelectThread(subagent)}>
                <Bot size={14} />
                <span>
                  <strong>{stringifyVisibleValue(subagent.agentNickname || subagent.agentRole || "Agent")}</strong>
                  {stringifyVisibleValue(subagent.title || "子任务")}
                </span>
                <time>{formatDesktopRelative(subagent.updatedAt)}</time>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="desktop-nav">
      <section className="desktop-section">
        <div className="desktop-section-title">项目</div>
        {projects.map((project) => (
          <div className="desktop-project-group" key={project.cwd}>
            <button className={`desktop-folder-row ${project.cwd === selectedCwd ? "active" : ""}`} type="button" onClick={() => onSelectProject(project)}>
              <FolderGit2 size={18} />
              <span>{stringifyVisibleValue(project.label || projectPathLabel(project.cwd))}</span>
            </button>
            <div className="desktop-thread-group">
              {(project.recentThreads || []).map((thread) => renderThreadBranch(thread))}
            </div>
          </div>
        ))}
      </section>

      <section className="desktop-section conversation-section">
        <div className="desktop-section-heading">
          <div className="desktop-section-title">对话</div>
          <div className="desktop-section-actions" aria-hidden="true">
            <ListFilter size={15} />
            <PencilLine size={15} />
          </div>
        </div>
        <label className="agent-search">
          <Search size={14} />
          <input value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} placeholder="搜索隐藏的多 agent" />
        </label>
        {recentThreads.map((thread) => renderThreadBranch(thread, "conversation-row"))}
      </section>
    </div>
  );
}

function ThreadListMeta({ updatedAt, isWaiting, isRunning }) {
  return (
    <span className="thread-list-meta">
      <span className="thread-time">
        <Clock3 size={13} />
        <time>{formatDesktopRelative(updatedAt)}</time>
      </span>
      {isWaiting || isRunning ? <span className="thread-spinner" aria-label="运行中" /> : null}
    </span>
  );
}

function ThreadList({ threads, selectedThreadId, onSelect }) {
  if (!threads.length) return <EmptyState icon={<MessageSquare />} title="No threads" body="Choose another project or wait for the index to refresh." />;

  return (
    <div className="list">
      {threads.map((thread) => (
        <button className={`list-card thread-card ${thread.id === selectedThreadId ? "active" : ""}`} key={thread.id} type="button" onClick={() => onSelect(thread.id)}>
          <MessageSquare size={19} />
          <span className="list-card-main">
            <strong>{stringifyVisibleValue(thread.title || "Untitled thread")}</strong>
            <small>{thread.gitBranch ? `${thread.gitBranch} · ` : ""}{formatRelative(thread.updatedAt)}</small>
          </span>
          <span className={`status-dot ${thread.status || "idle"}`} />
        </button>
      ))}
    </div>
  );
}

function ThreadDetail({ detail, messages, runState, loading, sending, awaitingReply, modelInfo, messagesEndRef, onSend, onCancel, onModelChange }) {
  if (!detail && !loading) {
    return <EmptyState icon={<Bot />} title="Select a thread" body="Open a thread to view messages, tool output, and run controls." />;
  }
  const runIsBlocking = isBlockingRunState(runState);
  const composerBusy = sending || runIsBlocking || awaitingReply;
  const liveStatus = liveStatusLabel({ sending, awaitingReply, runState });
  const displayItems = buildMessageDisplayItems(messages);
  const keepComposerVisible = useCallback(() => {
    for (const delay of [40, 180, 360]) {
      window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), delay);
    }
  }, [messagesEndRef]);

  return (
    <div className="thread-detail">
      <div className="thread-toolbar">
        <ModelSelector
          modelInfo={{
            ...modelInfo,
            model: detail?.thread?.effectiveModel || detail?.thread?.model || modelInfo.model
          }}
          onChange={onModelChange}
        />
        {runState.lastError ? <p className="run-error">{stringifyVisibleValue(runState.lastError)}</p> : null}
      </div>

      <div className="messages" aria-live="polite">
        {loading ? <LoadingRows /> : null}
        {!loading && !messages.length ? <EmptyState icon={<Clock3 />} title="No messages loaded" body="This thread may not have rollout events yet." /> : null}
        {displayItems.map((item) =>
          item.type === "pending-trace" ? (
            <TracePreview key="pending-trace" trace={item.trace} />
          ) : (
            <MessageBlock
              key={item.message.id}
              message={item.message}
              trace={item.trace}
            />
          )
        )}
        {liveStatus ? <LiveRunStatus label={liveStatus} runState={runState} /> : null}
        <div className="messages-end" ref={messagesEndRef} />
      </div>

      <Composer
        busy={composerBusy}
        detail={detail}
        modelInfo={modelInfo}
        onFocus={keepComposerVisible}
        onSend={onSend}
        onStop={onCancel}
      />
    </div>
  );
}

function TracePreview({ trace }) {
  if (!trace) return null;
  return (
    <div className="trace-preview-list">
      <TraceLine message={trace} />
    </div>
  );
}

function LiveRunStatus({ label, runState }) {
  const phase = stringifyVisibleValue(runState?.phase || "");
  return (
    <article className="live-status-row" aria-label={label}>
      <span className="live-status-icon">
        <Loader2 size={14} />
      </span>
      <span className="live-status-copy">
        <strong>{label}</strong>
        {phase && phase !== "idle" ? <em>{phase}</em> : null}
      </span>
      <span className="thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </article>
  );
}

function TraceLine({ message }) {
  const isTool = message.kind?.startsWith("tool") || message.role === "tool";
  const isRunState = message.kind === "run_state";
  if (isRunState) return null;
  if (!message.activityLabel && isTool) return null;
  const title = traceTitle(message);
  const status = message.toolStatus || (isRunState ? message.toolName : "finished");
  const failed = stringifyVisibleValue(status) === "failed";
  return (
    <article className={`trace-block ${isRunState ? "run-state" : ""}`}>
      <div className="trace-row">
        <span className="trace-title">
          {isRunState ? <Clock3 size={15} /> : <Wrench size={15} />}
          {message.activityLabel ? <strong>{message.activityLabel}</strong> : <strong>{title}</strong>}
        </span>
        {failed ? <ToolStatus status={status} /> : null}
      </div>
    </article>
  );
}

function MessageBlock({ message, trace = null }) {
  const isTool = message.kind?.startsWith("tool") || message.role === "tool";
  const isRunState = message.kind === "run_state";
  const isUser = message.role === "user";
  const rawText = message.text || message.outputPreview || "";
  const text = stringifyVisibleValue(rawText);

  if (isTool || isRunState) {
    return <TraceLine message={message} />;
  }

  return (
    <article className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">{isUser ? "You" : <Bot size={17} />}</div>
      <div className="message-bubble">
        <p>{text}</p>
        {!isUser ? <TracePreview trace={trace} /> : null}
        <time>{message.failed ? "Failed to send" : message.pending ? "Sending..." : formatRelative(message.createdAt)}</time>
      </div>
    </article>
  );
}

function traceTitle(message) {
  const toolName = stringifyVisibleValue(message.toolName || "");
  if (toolName) return toolName;
  if (message.kind === "tool_call") return "tool_call";
  if (message.kind === "tool_output") return "tool_output";
  if (message.kind === "run_state") return "run_state";
  return stringifyVisibleValue(message.kind || "trace");
}

function stringifyVisibleValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyVisibleValue).filter(Boolean).join("\n");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (value.text) return stringifyVisibleValue(value.text);
    if (typeof value.completed === "string") return value.completed;
    if (value.completed) return stringifyVisibleValue(value.completed);
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function ToolStatus({ status = "finished" }) {
  const statusText = stringifyVisibleValue(status || "finished");
  const failed = statusText === "failed";
  return (
    <span className={`tool-status ${failed ? "failed" : ""}`}>
      {failed ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
      {statusText}
    </span>
  );
}

function Composer({ busy, detail, modelInfo, onFocus, onSend, onStop }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const trigger = getComposerTrigger(message, cursorIndex);
  const slashSuggestions = buildSlashSuggestions({
    busy,
    onCancel: onStop,
    onSend,
    openFilePicker: () => fileInputRef.current?.click()
  });
  const mentionSuggestions = buildMentionSuggestions({ detail, modelInfo });
  const suggestions = trigger
    ? filterComposerSuggestions(trigger.kind === "slash" ? slashSuggestions : mentionSuggestions, trigger.query)
    : [];

  function updateCursor(event) {
    setCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  }

  function sendCurrentMessage() {
    const value = message.trim();
    if (busy || (!value && !files.length)) return;
    setMessage("");
    const filesToSend = files;
    setFiles([]);
    onSend(value, filesToSend);
  }

  function chooseSuggestion(item) {
    if (item.disabled) return;
    if (item.insertText) {
      const nextMessage = trigger ? applyComposerSuggestion(message, trigger, item.insertText) : item.insertText;
      const nextCursor = trigger ? trigger.start + item.insertText.length : item.insertText.length;
      setMessage(nextMessage);
      setCursorIndex(nextCursor);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
      return;
    }
    setMessage("");
    setCursorIndex(0);
    item.action?.();
  }

  function submit(event) {
    event.preventDefault();
    sendCurrentMessage();
  }

  function handleKeyDown(event) {
    if (trigger && suggestions.length && event.key === "Tab") {
      event.preventDefault();
      chooseSuggestion(suggestions[0]);
      return;
    }
    if (busy) return;
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    sendCurrentMessage();
  }

  return (
    <form className="composer" onSubmit={submit}>
      {trigger && suggestions.length ? (
        <div className="composer-assist" role="listbox" aria-label={trigger.kind === "slash" ? "Slash commands" : "Mentions"}>
          <div className="composer-assist-heading">{trigger.kind === "slash" ? "/ 命令" : "@ 引用"}</div>
          {suggestions.map((item) => (
            <button
              className="composer-assist-item"
              disabled={item.disabled}
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseSuggestion(item)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <div className="attachment-strip">
          {files.map((file, index) => (
            <span key={`${file.name}:${file.size}:${index}`}>
              {file.name}
              <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        autoCapitalize="sentences"
        enterKeyHint="send"
        placeholder={busy ? "Codex is responding. Tap stop to cancel this turn." : "Send a follow-up to Codex..."}
        ref={textareaRef}
        rows={2}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
          updateCursor(event);
        }}
        onClick={updateCursor}
        onFocus={(event) => {
          updateCursor(event);
          onFocus?.();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
      />
      <div className="composer-actions">
        <label className="attach-button" aria-label="Attach files">
          <Paperclip size={18} />
          <input
            accept="image/*,.pdf,.txt,.md,.csv,.json"
            multiple
            ref={fileInputRef}
            type="file"
            onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files || [])])}
          />
        </label>
        <button
          className={`send-button ${busy ? "running" : ""}`}
          type={busy ? "button" : "submit"}
          disabled={!busy && !message.trim() && !files.length}
          aria-label={busy ? "Stop current response" : "Send message"}
          onClick={busy ? onStop : undefined}
        >
          {busy ? <Square fill="currentColor" size={15} /> : <Send size={18} />}
        </button>
      </div>
    </form>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-card">
      <Loader2 className="spin" size={18} />
      <span>正在同步桌面消息和执行记录...</span>
    </div>
  );
}
