import { describe, expect, test } from "vitest";
import { applyComposerSuggestion, filterComposerSuggestions, getComposerTrigger } from "./composerAssist.js";

describe("getComposerTrigger", () => {
  test("detects a slash command at the current word", () => {
    expect(getComposerTrigger("请 /can", 7)).toEqual({ kind: "slash", query: "can", start: 2, end: 7 });
  });

  test("detects a mention at the current word", () => {
    expect(getComposerTrigger("看看 @当前", 6)).toEqual({ kind: "mention", query: "当前", start: 3, end: 6 });
  });

  test("ignores trigger characters from earlier words", () => {
    expect(getComposerTrigger("/cancel 后面继续写", 14)).toBeNull();
  });
});

describe("filterComposerSuggestions", () => {
  const suggestions = [
    { label: "Cancel", keywords: ["stop", "取消"] },
    { label: "Retry", keywords: ["重试"] },
    { label: "Status", keywords: ["状态"] }
  ];

  test("matches labels and keywords", () => {
    expect(filterComposerSuggestions(suggestions, "取").map((item) => item.label)).toEqual(["Cancel"]);
    expect(filterComposerSuggestions(suggestions, "sta").map((item) => item.label)).toEqual(["Status"]);
  });

  test("limits visible suggestions", () => {
    expect(filterComposerSuggestions(suggestions, "", 2).map((item) => item.label)).toEqual(["Cancel", "Retry"]);
  });
});

describe("applyComposerSuggestion", () => {
  test("replaces the trigger word and preserves surrounding text", () => {
    expect(applyComposerSuggestion("帮我 @当 看一下", { start: 3, end: 5 }, "@当前线程")).toEqual("帮我 @当前线程 看一下");
  });
});
