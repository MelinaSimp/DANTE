import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM client before importing the module under test.
vi.mock("@/lib/llm/client", () => ({
  complete: vi.fn(),
}));

import { complete } from "@/lib/llm/client";
import { runArchitectTurn } from "./agent-architect";

const mockComplete = vi.mocked(complete);

function llmReturns(json: object) {
  mockComplete.mockResolvedValueOnce({
    message: { role: "assistant", content: JSON.stringify(json) },
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    raw: {},
  } as never);
}

describe("runArchitectTurn", () => {
  beforeEach(() => mockComplete.mockReset());

  it("returns the assistant reply, a validated blueprint, and ready flag", async () => {
    llmReturns({
      reply: "Got it — I've set up a support agent. Want me to add appointment booking?",
      ready: false,
      blueprint: {
        name: "Plumbing Support",
        description: "Support agent for a plumbing company.",
        persona: "You are a friendly support agent for Joe's Plumbing.",
        first_message: "Hi! How can I help today?",
        model: "claude-sonnet-4-6",
        skills: ["draft_follow_up_email"],
        tools: ["memory.search", "email.send"],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "I need a support agent for my plumbing company." }],
      workspaceId: "ws-1",
    });

    expect(result.reply).toMatch(/support agent/i);
    expect(result.ready).toBe(false);
    expect(result.blueprint.name).toBe("Plumbing Support");
    expect(result.blueprint.tools).toEqual(["memory.search", "email.send"]);
  });

  it("strips CRE tools the model tries to suggest", async () => {
    llmReturns({
      reply: "Done.",
      ready: true,
      blueprint: {
        name: "Bot",
        description: "d",
        persona: "p",
        first_message: "hi",
        model: "claude-sonnet-4-6",
        skills: ["abstract_lease", "draft_follow_up_email"],
        tools: ["cre.calculate", "memory.search"],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "build me something" }],
      workspaceId: "ws-1",
    });

    expect(result.blueprint.tools).toEqual(["memory.search"]);
    expect(result.blueprint.skills).toEqual(["draft_follow_up_email"]);
  });

  it("forces ready=false when the blueprint fails validation", async () => {
    llmReturns({
      reply: "What should we call it?",
      ready: true, // model wrongly claims ready
      blueprint: {
        name: "", // invalid → not ready
        description: "d",
        persona: "p",
        first_message: "hi",
        model: "claude-sonnet-4-6",
        skills: [],
        tools: [],
      },
    });

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "make an agent" }],
      workspaceId: "ws-1",
    });

    expect(result.ready).toBe(false);
    expect(result.blueprintErrors.join(" ")).toMatch(/name/i);
  });

  it("degrades gracefully when the model returns non-JSON", async () => {
    mockComplete.mockResolvedValueOnce({
      message: { role: "assistant", content: "sorry, I'm confused" },
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      raw: {},
    } as never);

    const result = await runArchitectTurn({
      transcript: [{ role: "user", content: "hi" }],
      workspaceId: "ws-1",
    });

    expect(result.ready).toBe(false);
    expect(result.reply.length).toBeGreaterThan(0);
    // A fully-typed (empty) blueprint is still returned.
    expect(Array.isArray(result.blueprint.tools)).toBe(true);
  });

  it("passes json_object response format and a workspace-scoped feature tag", async () => {
    llmReturns({ reply: "ok", ready: false, blueprint: {} });
    await runArchitectTurn({
      transcript: [{ role: "user", content: "hi" }],
      workspaceId: "ws-42",
    });
    const opts = mockComplete.mock.calls[0][0];
    expect(opts.responseFormat).toEqual({ type: "json_object" });
    expect(opts.feature).toBe("agent.architect");
    expect(opts.workspaceId).toBe("ws-42");
    // System prompt is prepended.
    expect(opts.messages[0].role).toBe("system");
  });
});
