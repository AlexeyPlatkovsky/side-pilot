import { describe, expect, it } from "vitest";
import { describeError } from "./api";

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
});
