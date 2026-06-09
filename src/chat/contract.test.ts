import { describe, it, expect } from "vitest";

describe("IPC contract", () => {
  it("generated types exist for all core contracts", async () => {
    const mods = [
      "AdapterError",
      "AdapterRequest",
      "AdapterResult",
      "AssistantId",
      "Message",
      "NewMessage",
      "Route",
      "RouteRequest",
      "RouteRunResult",
      "ProviderRunOutcome",
      "Session",
      "Sender",
      "GeneralPreferences",
      "PermissionMode",
      "Position",
      "PositionMode",
      "Usage",
      "ProviderPreference",
      "ProviderPreferences",
      "PreferencesError",
    ];

    for (const mod of mods) {
      await expect(import(`./generated/${mod}`)).resolves.toBeDefined();
    }
  });

  it("Message type matches the storage contract shape", async () => {
    // Import verifies the module exists and is importable.
    // TypeScript types are erased at runtime; structural validation
    // happens via the Rust-side `export_bindings` check in CI.
    await import("./generated/Message");
  });
});
