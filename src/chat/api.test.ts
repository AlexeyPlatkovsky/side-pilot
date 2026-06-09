import { describe, expect, it } from "vitest";
import { describeError, toChatMessage } from "./api";

describe("describeError", () => {
  it("does not expose a raw CLI diagnostic dump in the error banner", () => {
    const message = describeError({
      kind: "nonZeroExit",
      code: 404,
      stderr: [
        "Full report available at: /var/folders/example/gemini-client-error.json",
        "ModelNotFoundError: Requested entity was not found.",
        "    at classifyGoogleError (file:///gemini/chunk.js:304138:12)",
      ].join("\n"),
    });

    expect(message).toBe("GPT exited with an error: Requested entity was not found.");
  });

  it("returns a string as-is", () => {
    expect(describeError("raw string")).toBe("raw string");
  });

  it("formats binaryNotFound", () => {
    expect(describeError({ kind: "binaryNotFound" })).toBe(
      "GPT isn\u2019t available \u2014 its CLI wasn\u2019t found on your PATH.",
    );
  });

  it("formats notAuthenticated", () => {
    expect(describeError({ kind: "notAuthenticated" })).toBe(
      "GPT is not authenticated. Sign in to its CLI and try again.",
    );
  });

  it("formats timedOut", () => {
    expect(describeError({ kind: "timedOut" })).toBe("GPT timed out before responding.");
  });

  it("formats cancelled", () => {
    expect(describeError({ kind: "cancelled" })).toBe("The GPT request was cancelled.");
  });

  it("formats outputParseFailure", () => {
    expect(describeError({ kind: "outputParseFailure" })).toBe(
      "GPT returned output that could not be read.",
    );
  });

  it("formats notFound", () => {
    expect(describeError({ kind: "notFound" })).toBe(
      "That conversation could not be found in local history.",
    );
  });

  it("formats query", () => {
    expect(describeError({ kind: "query" })).toBe(
      "Local history is unavailable right now.",
    );
  });

  it("formats storageUnavailable", () => {
    expect(describeError({ kind: "storageUnavailable" })).toBe(
      "Local history is unavailable right now.",
    );
  });

  it("formats unsupportedSchemaVersion", () => {
    expect(describeError({ kind: "unsupportedSchemaVersion" })).toBe(
      "Local history was created by a newer app version.",
    );
  });

  it("formats an unknown kind with the kind name", () => {
    expect(describeError({ kind: "networkError" })).toBe(
      "Something went wrong (networkError).",
    );
  });

  it("returns Error.message for Error instances", () => {
    expect(describeError(new Error("something broke"))).toBe("something broke");
  });

  it("returns the fallback for an unknown object", () => {
    expect(describeError({ random: true })).toBe("Something went wrong.");
  });

  it("uses the provided locale", () => {
    expect(describeError({ kind: "notFound" }, "ru")).toBe(
      "Этот диалог не найден в локальной истории.",
    );
  });
});

describe("toChatMessage", () => {
  it("maps a persisted message to the UI chat shape", () => {
    const result = toChatMessage({
      id: "msg-1",
      sessionId: "s1",
      seq: 5,
      sender: "assistant",
      assistantId: "codex",
      model: "gpt-4",
      reasoningEffort: null,
      content: "Hello",
      rawJson: null,
      isError: false,
      createdAt: 1000,
    });

    expect(result).toEqual({
      id: "msg-1",
      sender: "assistant",
      assistantId: "codex",
      model: "gpt-4",
      reasoningEffort: undefined,
      content: "Hello",
      createdAt: 1000,
      error: undefined,
    });
  });

  it("maps an error message with isError=true", () => {
    const result = toChatMessage({
      id: "msg-2",
      sessionId: "s1",
      seq: 6,
      sender: "assistant",
      assistantId: "gemini",
      model: null,
      reasoningEffort: null,
      content: "Error occurred",
      rawJson: null,
      isError: true,
      createdAt: 2000,
    });

    expect(result.error).toBe(true);
  });
});
