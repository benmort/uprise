import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCredentials,
  getCredentials,
  setCredentials,
} from "./auth";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key) || null : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("auth credential storage", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    (globalThis as any).window = {
      sessionStorage,
      localStorage,
    };
  });

  it("stores credentials in sessionStorage", () => {
    setCredentials({ username: "admin", password: "secret" });
    const raw = sessionStorage.getItem("yarn_auth_credentials");
    expect(raw).not.toBeNull();
    expect(localStorage.getItem("yarn_auth_credentials")).toBeNull();
  });

  it("migrates legacy localStorage credentials on first read", () => {
    localStorage.setItem(
      "yarn_auth_credentials",
      JSON.stringify({ username: "legacy", password: "value" }),
    );
    const credentials = getCredentials();
    expect(credentials).toEqual({ username: "legacy", password: "value" });
    expect(sessionStorage.getItem("yarn_auth_credentials")).toBeTruthy();
    expect(localStorage.getItem("yarn_auth_credentials")).toBeNull();
  });

  it("clears credentials from both session and local storage", () => {
    setCredentials({ username: "admin", password: "secret" });
    localStorage.setItem("yarn_auth_credentials", JSON.stringify({ username: "stale", password: "old" }));
    clearCredentials();
    expect(sessionStorage.getItem("yarn_auth_credentials")).toBeNull();
    expect(localStorage.getItem("yarn_auth_credentials")).toBeNull();
  });
});
