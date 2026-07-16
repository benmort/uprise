import { describe, it, expect } from "vitest";
import {
  parseFilter,
  matchesConversationFilter,
  matchesConversationSearch,
  sortConversations,
  type FilterableRow,
  type SearchableRow,
} from "./filters";

const row = (o: Partial<FilterableRow>): FilterableRow => ({ unreadCount: 0, resolved: false, ...o });

describe("parseFilter", () => {
  it("passes through a valid filter key", () => {
    expect(parseFilter("unresolved")).toBe("unresolved");
    expect(parseFilter("priority")).toBe("priority");
  });
  it("falls back to 'all' for null / unknown values", () => {
    expect(parseFilter(null)).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(parseFilter("nonsense")).toBe("all");
  });
});

describe("matchesConversationFilter", () => {
  it("'all' matches everything", () => {
    expect(matchesConversationFilter(row({ resolved: true }), "all")).toBe(true);
  });
  it("'unresolved' excludes resolved rows", () => {
    expect(matchesConversationFilter(row({ resolved: false }), "unresolved")).toBe(true);
    expect(matchesConversationFilter(row({ resolved: true }), "unresolved")).toBe(false);
  });
  it("'awaiting-response' = unread and unresolved", () => {
    expect(matchesConversationFilter(row({ unreadCount: 2 }), "awaiting-response")).toBe(true);
    expect(matchesConversationFilter(row({ unreadCount: 0 }), "awaiting-response")).toBe(false);
    expect(matchesConversationFilter(row({ unreadCount: 2, resolved: true }), "awaiting-response")).toBe(false);
  });
  it("'responded' = no unread and unresolved", () => {
    expect(matchesConversationFilter(row({ unreadCount: 0 }), "responded")).toBe(true);
    expect(matchesConversationFilter(row({ unreadCount: 1 }), "responded")).toBe(false);
  });
  it("'priority' = (3+ unread OR starred) and unresolved", () => {
    expect(matchesConversationFilter(row({ unreadCount: 3 }), "priority")).toBe(true);
    expect(matchesConversationFilter(row({ unreadCount: 0, isStarred: true }), "priority")).toBe(true);
    expect(matchesConversationFilter(row({ unreadCount: 2 }), "priority")).toBe(false);
    expect(matchesConversationFilter(row({ unreadCount: 5, resolved: true }), "priority")).toBe(false);
  });
});

describe("matchesConversationSearch", () => {
  const r: SearchableRow = { sender: "Ada Lovelace", identity: "+61400000000", subject: "Volunteering", preview: "Count me in" };
  it("matches an empty query", () => expect(matchesConversationSearch(r, "  ")).toBe(true));
  it("matches across any field, case-insensitively", () => {
    expect(matchesConversationSearch(r, "lovelace")).toBe(true);
    expect(matchesConversationSearch(r, "61400")).toBe(true);
    expect(matchesConversationSearch(r, "count me")).toBe(true);
  });
  it("rejects a non-matching query", () => expect(matchesConversationSearch(r, "zzz")).toBe(false));
});

describe("sortConversations", () => {
  it("sorts newest-first by sortAt without mutating the input", () => {
    const input = [{ sortAt: 1 }, { sortAt: 3 }, { sortAt: 2 }];
    const out = sortConversations(input);
    expect(out.map((r) => r.sortAt)).toEqual([3, 2, 1]);
    expect(input.map((r) => r.sortAt)).toEqual([1, 3, 2]); // original untouched
  });
});
