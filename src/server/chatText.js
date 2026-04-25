export function stringifyVisibleValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyVisibleValue).filter(Boolean).join("\n");
  }
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

export function cleanChatText(text) {
  const value = stringifyVisibleValue(text).trim();
  const marker = "## My request for Codex:";
  if (!value.includes("# In app browser:") || !value.includes(marker)) return value;
  const request = value.slice(value.indexOf(marker) + marker.length).trim();
  return request.replace(/<image>\s*<\/image>/g, "").trim();
}
