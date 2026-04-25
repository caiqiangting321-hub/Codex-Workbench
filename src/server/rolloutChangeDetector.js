export function detectRolloutChanges(previous, threads, mtimes) {
  const next = new Map();
  const changed = [];

  for (const thread of threads) {
    if (!thread.rolloutPath) continue;
    const mtime = mtimes.get(thread.rolloutPath);
    if (!Number.isFinite(mtime)) continue;
    next.set(thread.rolloutPath, mtime);
    if (previous.has(thread.rolloutPath) && previous.get(thread.rolloutPath) !== mtime) {
      changed.push({ threadId: thread.id, cwd: thread.cwd, rolloutPath: thread.rolloutPath });
    }
  }

  return { next, changed };
}
