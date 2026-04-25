import { execFile } from "node:child_process";

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function readClipboard() {
  try {
    return await execFileAsync("pbpaste", [], { timeout: 3000 });
  } catch {
    return null;
  }
}

async function writeClipboard(text) {
  await new Promise((resolve, reject) => {
    const child = execFile("pbcopy", [], (error) => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin.end(text);
  });
}

export function buildCodexThreadDeepLink(threadId) {
  return `codex://threads/${encodeURIComponent(threadId)}`;
}

export async function openCodexThreadInDesktop(threadId) {
  const url = buildCodexThreadDeepLink(threadId);
  await execFileAsync("open", [url], { timeout: 5000 });
  return { ok: true, url, strategy: "codex-deeplink" };
}

export async function sendToCodexDesktop(text) {
  const previousClipboard = await readClipboard();
  await writeClipboard(text);
  try {
    await execFileAsync(
      "osascript",
      [
        "-e",
        `
          tell application "Codex" to activate
          delay 0.25
          tell application "System Events"
            tell process "Codex"
              keystroke "v" using command down
              delay 0.05
              key code 36
            end tell
          end tell
        `
      ],
      { timeout: 10000 }
    );
  } finally {
    if (previousClipboard !== null) {
      setTimeout(() => {
        writeClipboard(previousClipboard).catch(() => {});
      }, 1200).unref();
    }
  }
}

export async function stopCodexDesktopResponse() {
  await execFileAsync(
    "osascript",
    [
      "-e",
      `
        tell application "Codex" to activate
        delay 0.2
        tell application "System Events"
          tell process "Codex"
            key code 53
            delay 0.05
            keystroke "." using command down
          end tell
        end tell
      `
    ],
    { timeout: 10000 }
  );
  return { ok: true, strategy: "codex-desktop-interrupt" };
}
