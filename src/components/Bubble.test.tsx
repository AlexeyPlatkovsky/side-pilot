import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bubble } from "./Bubble";

describe("Bubble", () => {
  it("renders the compact bubble by default, with no panel", () => {
    render(<Bubble resizeWindow={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /open side-pilot/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("expands into the panel when the bubble is clicked", async () => {
    const user = userEvent.setup();
    render(<Bubble resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /open side-pilot/i }));

    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("collapses back when the close control is clicked", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /collapse/i }));

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open side-pilot/i }),
    ).toBeInTheDocument();
  });

  it("collapses when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);
    expect(screen.getByTestId("panel")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("resizes the OS window on mount and on every state change", async () => {
    const user = userEvent.setup();
    const resizeWindow = vi.fn();
    render(<Bubble resizeWindow={resizeWindow} />);

    expect(resizeWindow).toHaveBeenLastCalledWith("collapsed");

    await user.click(screen.getByRole("button", { name: /open side-pilot/i }));
    expect(resizeWindow).toHaveBeenLastCalledWith("expanded");
  });

  it("marks a drag region so the window can be moved", () => {
    const { container } = render(<Bubble resizeWindow={vi.fn()} />);
    expect(container.querySelector("[data-tauri-drag-region]")).not.toBeNull();
  });
});
