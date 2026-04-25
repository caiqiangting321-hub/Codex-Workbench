function messageText(message) {
  return message?.text || message?.outputPreview || "";
}

function localUserKey(message) {
  return `${message.role || ""}:${message.kind || ""}:${messageText(message)}`;
}

export function mergeFetchedMessagesWithLocalDrafts(fetchedMessages, currentMessages, threadId = null) {
  const fetched = Array.isArray(fetchedMessages) ? fetchedMessages : [];
  const fetchedKeys = new Set(fetched.map(localUserKey));
  const targetThreadId = threadId || fetched.find((message) => message?.threadId)?.threadId || null;
  const localDrafts = (Array.isArray(currentMessages) ? currentMessages : []).filter((message) => {
    if (!message?.id?.startsWith("local:")) return false;
    if (targetThreadId && message.threadId !== targetThreadId) return false;
    if (!message.pending && !message.failed) return false;
    return !fetchedKeys.has(localUserKey(message));
  });

  return [...fetched, ...localDrafts].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
