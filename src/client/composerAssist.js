const TRIGGER_PATTERN = /(?:^|\s)([\/@])([^\s\/@]*)$/u;

export function getComposerTrigger(value, cursorIndex = value.length) {
  const beforeCursor = String(value || "").slice(0, cursorIndex);
  const match = beforeCursor.match(TRIGGER_PATTERN);
  if (!match) return null;
  const marker = match[1];
  const query = match[2] || "";
  const start = beforeCursor.length - marker.length - query.length;
  return {
    kind: marker === "/" ? "slash" : "mention",
    query,
    start,
    end: cursorIndex
  };
}

export function filterComposerSuggestions(suggestions, query = "", limit = 5) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = normalizedQuery
    ? suggestions.filter((item) =>
        [item.label, item.description, ...(item.keywords || [])].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))
      )
    : suggestions;
  return filtered.slice(0, limit);
}

export function applyComposerSuggestion(value, trigger, insertText) {
  const text = String(value || "");
  return `${text.slice(0, trigger.start)}${insertText}${text.slice(trigger.end)}`;
}
