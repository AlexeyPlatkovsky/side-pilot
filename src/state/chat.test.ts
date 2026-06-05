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
});
