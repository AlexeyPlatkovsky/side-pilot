import { describe, it, expect } from "vitest";
import { chatReducer, initialChatState, type ChatMessage, type ChatState } from "./chat";

const userMsg = (content: string): ChatMessage => ({
  id: `u-${content}`,
  sender: "user",
  content,
  createdAt: 1,
});

const assistantMsg = (content: string): ChatMessage => ({
  id: `a-${content}`,
  sender: "assistant",
  assistantId: "codex",
  content,
  createdAt: 1,
});

describe("chatReducer", () => {
  it("loads history, replacing the transcript and returning to idle", () => {
    const state = chatReducer(initialChatState, {
      type: "loaded",
      messages: [userMsg("hi"), assistantMsg("hello")],
    });
    expect(state.messages.map((m) => m.content)).toEqual(["hi", "hello"]);
    expect(state.status).toEqual({ kind: "idle" });
  });

  it("loads history into the pending state when the session has a reply in flight", () => {
    // Switching back to a chat whose reply is still running must restore the
    // thinking indicator (SP-005 bug fix), not show it as idle.
    const state = chatReducer(initialChatState, {
      type: "loaded",
      messages: [userMsg("still working?")],
      pending: true,
    });
    expect(state.messages.map((m) => m.content)).toEqual(["still working?"]);
    expect(state.status).toEqual({ kind: "pending" });
  });

  it("submit appends the user message and enters the pending state", () => {
    const state = chatReducer(initialChatState, {
      type: "submit",
      message: userMsg("explain this"),
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(userMsg("explain this"));
    expect(state.status).toEqual({ kind: "pending" });
  });

  it("success appends the assistant message and returns to idle", () => {
    const pending: ChatState = {
      messages: [userMsg("explain this")],
      status: { kind: "pending" },
    };
    const state = chatReducer(pending, {
      type: "success",
      message: assistantMsg("here you go"),
    });
    expect(state.messages.map((m) => m.content)).toEqual(["explain this", "here you go"]);
    expect(state.status).toEqual({ kind: "idle" });
  });

  it("error keeps the transcript and surfaces the message", () => {
    const pending: ChatState = {
      messages: [userMsg("explain this")],
      status: { kind: "pending" },
    };
    const state = chatReducer(pending, {
      type: "error",
      message: "CLI is not authenticated",
    });
    // The user's message must NOT be lost when the run fails.
    expect(state.messages).toEqual([userMsg("explain this")]);
    expect(state.status).toEqual({
      kind: "error",
      message: "CLI is not authenticated",
    });
  });

  it("does not mutate the input state", () => {
    const before: ChatState = { ...initialChatState };
    chatReducer(before, { type: "submit", message: userMsg("x") });
    expect(before).toEqual(initialChatState);
  });

  // ---- Multi-provider route lifecycle (SP-017) ----------------------------

  const pendingSlot = (provider: string): ChatMessage => ({
    id: `pending-${provider}`,
    sender: "assistant",
    assistantId: provider,
    content: "",
    createdAt: 1,
    pending: true,
  });

  it("routeSubmit appends the user message plus one pending slot per provider", () => {
    const state = chatReducer(initialChatState, {
      type: "routeSubmit",
      userMessage: userMsg("to all"),
      slots: [pendingSlot("codex"), pendingSlot("claude"), pendingSlot("gemini")],
    });
    expect(state.messages).toHaveLength(4);
    expect(state.messages.filter((m) => m.pending)).toHaveLength(3);
    expect(state.status).toEqual({ kind: "pending" });
  });

  it("routeSettled swaps the pending slots for their results and returns to idle", () => {
    const submitted = chatReducer(initialChatState, {
      type: "routeSubmit",
      userMessage: userMsg("to all"),
      slots: [pendingSlot("codex"), pendingSlot("gemini")],
    });
    const settled = chatReducer(submitted, {
      type: "routeSettled",
      results: [
        assistantMsg("gpt reply"),
        {
          id: "err-gemini",
          sender: "assistant",
          assistantId: "gemini",
          content: "Gemini timed out before responding.",
          createdAt: 1,
          error: true,
        },
      ],
    });
    // No pending slots remain; user message + the two results are present.
    expect(settled.messages.some((m) => m.pending)).toBe(false);
    expect(settled.messages.map((m) => m.content)).toEqual([
      "to all",
      "gpt reply",
      "Gemini timed out before responding.",
    ]);
    expect(settled.messages.find((m) => m.error)?.assistantId).toBe("gemini");
    expect(settled.status).toEqual({ kind: "idle" });
  });

  it("error drops orphaned pending slots but keeps the user message", () => {
    const submitted = chatReducer(initialChatState, {
      type: "routeSubmit",
      userMessage: userMsg("to all"),
      slots: [pendingSlot("codex"), pendingSlot("claude")],
    });
    const errored = chatReducer(submitted, {
      type: "error",
      message: "Local history is unavailable right now.",
    });
    expect(errored.messages.map((m) => m.content)).toEqual(["to all"]);
    expect(errored.messages.some((m) => m.pending)).toBe(false);
    expect(errored.status).toEqual({
      kind: "error",
      message: "Local history is unavailable right now.",
    });
  });
});
