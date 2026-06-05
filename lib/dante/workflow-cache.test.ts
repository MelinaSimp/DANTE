// lib/dante/workflow-cache.test.ts
//
// Tests for the cross-run step result cache.

import { describe, it, expect } from "vitest";
import {
  makeCacheKey,
  getDefaultTTL,
  isCacheableStep,
} from "./workflow-cache";

// ── makeCacheKey ────────────────────────────────────────────────

describe("makeCacheKey", () => {
  it("produces a 64-char hex string (SHA-256)", async () => {
    const key = await makeCacheKey("ws-1", "openai", { model: "gpt-4o" });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", async () => {
    const a = await makeCacheKey("ws-1", "query_clients", { filter: "active" });
    const b = await makeCacheKey("ws-1", "query_clients", { filter: "active" });
    expect(a).toBe(b);
  });

  it("varies when workspaceId changes", async () => {
    const a = await makeCacheKey("ws-1", "openai", { model: "gpt-4o" });
    const b = await makeCacheKey("ws-2", "openai", { model: "gpt-4o" });
    expect(a).not.toBe(b);
  });

  it("varies when stepType changes", async () => {
    const a = await makeCacheKey("ws-1", "openai", { model: "gpt-4o" });
    const b = await makeCacheKey("ws-1", "code", { model: "gpt-4o" });
    expect(a).not.toBe(b);
  });

  it("varies when config changes", async () => {
    const a = await makeCacheKey("ws-1", "openai", { model: "gpt-4o" });
    const b = await makeCacheKey("ws-1", "openai", { model: "gpt-4.1" });
    expect(a).not.toBe(b);
  });

  it("sorts config keys for deterministic hashing", async () => {
    const a = await makeCacheKey("ws-1", "http", { url: "https://x.co", method: "GET" });
    const b = await makeCacheKey("ws-1", "http", { method: "GET", url: "https://x.co" });
    expect(a).toBe(b);
  });
});

// ── getDefaultTTL ──────────────────────────────────────────────

describe("getDefaultTTL", () => {
  it("returns 60 for openai steps", () => {
    expect(getDefaultTTL("openai")).toBe(60);
  });

  it("returns 60 for agent steps", () => {
    expect(getDefaultTTL("agent")).toBe(60);
  });

  it("returns 15 for query_clients", () => {
    expect(getDefaultTTL("query_clients")).toBe(15);
  });

  it("returns 15 for query_properties", () => {
    expect(getDefaultTTL("query_properties")).toBe(15);
  });

  it("returns 30 for http steps", () => {
    expect(getDefaultTTL("http")).toBe(30);
  });

  it("returns 120 for code steps", () => {
    expect(getDefaultTTL("code")).toBe(120);
  });

  it("returns 60 as default for unknown step types", () => {
    expect(getDefaultTTL("some_unknown_step")).toBe(60);
  });
});

// ── isCacheableStep ────────────────────────────────────────────

describe("isCacheableStep", () => {
  it("returns true for cacheable step types", () => {
    const cacheable = [
      "openai", "agent", "query_clients", "query_properties",
      "http", "code", "integration_query", "condition", "transform",
    ];
    for (const type of cacheable) {
      expect(isCacheableStep(type)).toBe(true);
    }
  });

  it("returns false for side-effect steps", () => {
    const nonCacheable = [
      "send_email", "send_sms", "update_contact", "approval",
    ];
    for (const type of nonCacheable) {
      expect(isCacheableStep(type)).toBe(false);
    }
  });

  it("returns false for trigger steps", () => {
    const triggers = [
      "trigger_manual", "trigger_cron", "trigger_webhook",
      "trigger_at", "trigger_lease_expiry",
    ];
    for (const type of triggers) {
      expect(isCacheableStep(type)).toBe(false);
    }
  });
});
