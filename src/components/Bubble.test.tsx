import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("does NOT expand when the bubble is dragged (pointer moves before release)", () => {
    render(<Bubble resizeWindow={vi.fn()} />);
    const dot = screen.getByRole("button", { name: /open side-pilot/i });

    // Drag: press at one screen position, release/click at a far one.
    fireEvent.mouseDown(dot, { screenX: 0, screenY: 0 });
    fireEvent.click(dot, { screenX: 80, screenY: 40 });

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("expands on a click that does not move (press and release in place)", () => {
    render(<Bubble resizeWindow={vi.fn()} />);
    const dot = screen.getByRole("button", { name: /open side-pilot/i });

    fireEvent.mouseDown(dot, { screenX: 12, screenY: 12 });
    fireEvent.click(dot, { screenX: 12, screenY: 12 });

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

  it("minimizes the shell back to the bubble when minimize is clicked", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /minimize/i }));

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open side-pilot/i }),
    ).toBeInTheDocument();
  });

  it("places the minimize control to the left of the close control", () => {
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    const minimize = screen.getByRole("button", { name: /minimize/i });
    const close = screen.getByRole("button", { name: /collapse/i });

    // Minimize precedes close in document order (it sits to its left).
    expect(
      minimize.compareDocumentPosition(close) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
