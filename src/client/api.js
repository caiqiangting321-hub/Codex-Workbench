const TOKEN_KEY = "codex.workbench.tokens";

export function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeTokens(tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

function encodeQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export class ApiClient {
  constructor({ getAccessToken, getRefreshToken, onTokenRefresh, onUnauthorized }) {
    this.getAccessToken = getAccessToken;
    this.getRefreshToken = getRefreshToken;
    this.onTokenRefresh = onTokenRefresh;
    this.onUnauthorized = onUnauthorized;
  }

  async request(path, options = {}) {
    return this.requestWithToken(path, options, true);
  }

  async requestWithToken(path, options = {}, allowRefresh) {
    const token = this.getAccessToken();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (error) {
      throw new Error(error?.message === "Load failed" ? "上传或网络请求失败。图片可能过大，或手机与电脑连接中断。" : error?.message || "Network request failed");
    }
    if (response.status === 401 && allowRefresh) {
      const refreshed = await this.refresh();
      if (refreshed) return this.requestWithToken(path, options, false);
    }

    if (response.status === 401) {
      this.onUnauthorized?.();
      throw new Error("Session expired. Please sign in again.");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === "object" ? payload.error || payload.message : payload;
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    return payload;
  }

  async refresh() {
    const refreshToken = this.getRefreshToken?.();
    if (!refreshToken) return false;
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) return false;
    const payload = await response.json();
    this.onTokenRefresh?.(payload);
    return true;
  }

  login(password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
  }

  authStatus() {
    return this.request("/api/auth/status");
  }

  setupPassword(password) {
    return this.request("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password })
    });
  }

  changePassword(currentPassword, newPassword) {
    return this.request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  projects() {
    return this.request("/api/projects");
  }

  threads(projectCwd) {
    return this.request(`/api/threads${encodeQuery({ project: projectCwd })}`);
  }

  thread(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}`);
  }

  messages(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/messages`);
  }

  send(threadId, message, attachments = []) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/send`, {
      method: "POST",
      body: JSON.stringify({ message, attachments })
    });
  }

  uploadFiles(files) {
    return this.request("/api/uploads", {
      method: "POST",
      body: JSON.stringify({ files })
    });
  }

  cancel(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/cancel`, { method: "POST" });
  }

  retry(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/retry`, { method: "POST" });
  }

  openDesktopThread(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/open-desktop`, { method: "POST" });
  }

  status() {
    return this.request("/api/system/status");
  }

  model() {
    return this.request("/api/system/model");
  }

  setModel(model) {
    return this.request("/api/system/model", {
      method: "POST",
      body: JSON.stringify({ model })
    });
  }

  threadModel(threadId) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/model`);
  }

  setThreadModel(threadId, model) {
    return this.request(`/api/threads/${encodeURIComponent(threadId)}/model`, {
      method: "POST",
      body: JSON.stringify({ model })
    });
  }
}
