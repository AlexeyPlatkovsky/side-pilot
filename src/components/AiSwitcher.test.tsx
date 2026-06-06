import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiSwitcher } from "./AiSwitcher";
import type { ActiveRoute } from "../chat/providers";

const SINGLE_CODEX: ActiveRoute = { kind: "single", provider: "codex" };

describe("AiSwitcher", () => {
  it("shows the active provider and keeps the picker closed by default", () => {
    render(<AiSwitcher route={SINGLE_CODEX} disabled={false} onSelect={() => {}} />);
    const toggle = screen.getByRole("button", {
      name: /choose ai provider \(current: GPT\)/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a vertical picker with All at the top and the active provider highlighted", async () => {
    const user = userEvent.setup();
    render(<AiSwitcher route={SINGLE_CODEX} disabled={false} onSelect={() => {}} />);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));

    const options = screen.getAllByRole("menuitemradio");
    // Order/labels via the label span (the glyph is aria-hidden and would
    // otherwise pollute textContent).
    expect(
      options.map((o) => o.querySelector(".ai-switcher__option-label")?.textContent),
    ).toEqual(["All", "GPT", "Claude", "Gemini"]);
    // The active single-provider option is checked; "All" is not.
    expect(screen.getByRole("menuitemradio", { name: /^All/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemradio", { name: "GPT" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("selecting a provider reports the route and closes the picker", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AiSwitcher route={SINGLE_CODEX} disabled={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Claude" }));

    expect(onSelect).toHaveBeenCalledWith({ kind: "single", provider: "claude" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("selecting All reports the All route", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AiSwitcher route={SINGLE_CODEX} disabled={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));

    expect(onSelect).toHaveBeenCalledWith({ kind: "all" });
  });

  it("does not open while a response is in flight (disabled)", async () => {
    const user = userEvent.setup();
    render(<AiSwitcher route={SINGLE_CODEX} disabled onSelect={() => {}} />);

    const toggle = screen.getByRole("button", { name: /choose ai provider/i });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the picker on Escape without changing the selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AiSwitcher route={SINGLE_CODEX} disabled={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reflects the All route on the toggle face", () => {
    render(<AiSwitcher route={{ kind: "all" }} disabled={false} onSelect={() => {}} />);
    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: All\)/i }),
    ).toBeInTheDocument();
  });
});
