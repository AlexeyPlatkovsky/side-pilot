import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const viteConfig = readFileSync("vite.config.ts", "utf8");
const tauriConfig = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
) as {
  build: {
    devUrl: string;
  };
};

describe("independent variant launch configuration", () => {
  it("uses the assigned Vite dev-server port", () => {
    expect(viteConfig).toContain("port: 5175");
  });

  it("points Tauri at the assigned dev URL", () => {
    expect(tauriConfig.build.devUrl).toBe("http://localhost:5175");
  });
});
