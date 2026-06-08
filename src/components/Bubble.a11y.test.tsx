import { describe, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Bubble } from "./Bubble";
import { checkA11y } from "../test/a11y";

describe("Bubble a11y", () => {
  it("bubble trigger has no a11y violations", async () => {
    const { container } = render(<Bubble resizeWindow={vi.fn()} />);
    await screen.findByRole("button", { name: /open side-pilot/i });
    await checkA11y(container, "bubble collapsed");
  });
});
