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
    // Let the freshly-mounted chat body finish its async load.
    await screen.findByLabelText("Ask side-pilot");
  });

  it("does NOT expand when the bubble is dragged (pointer moves before release)", () => {
    render(<Bubble resizeWindow={vi.fn()} />);
    const dot = screen.getByRole("button", { name: /open side-pilot/i });

    // Drag: press at one screen position, release/click at a far one.
    fireEvent.mouseDown(dot, { screenX: 0, screenY: 0 });
    fireEvent.click(dot, { screenX: 80, screenY: 40 });

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("expands on a click that does not move (press and release in place)", async () => {
    render(<Bubble resizeWindow={vi.fn()} />);
    const dot = screen.getByRole("button", { name: /open side-pilot/i });

    fireEvent.mouseDown(dot, { screenX: 12, screenY: 12 });
    fireEvent.click(dot, { screenX: 12, screenY: 12 });

    expect(screen.getByTestId("panel")).toBeInTheDocument();
    await screen.findByLabelText("Ask side-pilot");
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

  it("renders the warm companion panel identity", async () => {
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    // findBy lets the chat body's async mount-load settle before asserting.
    expect(
      await screen.findByRole("heading", { name: /side-pilot companion/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument();
  });

  it("opens the settings view when the gear control is clicked", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /open settings/i }));

    // The panel shell stays; its body switches to the settings view.
    expect(screen.getByTestId("settings")).toBeInTheDocument();
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("minimizes to the bubble when the header identity icon is clicked", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /minimize/i }));

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open side-pilot/i }),
    ).toBeInTheDocument();
  });

  it("places the settings (gear) control to the left of the close control", async () => {
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    const settings = await screen.findByRole("button", {
      name: /open settings/i,
    });
    const close = screen.getByRole("button", { name: /collapse/i });

    // The gear precedes close in document order (it sits to its left).
    expect(
      settings.compareDocumentPosition(close) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("returns to the panel (not the bubble) when Back is clicked in settings", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="settings" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByTestId("panel")).toBeInTheDocument();
    expect(screen.queryByTestId("settings")).not.toBeInTheDocument();
    // Let the freshly-mounted chat body finish its async load.
    await screen.findByLabelText("Ask side-pilot");
  });

  it("steps back to the panel when Escape is pressed in settings", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="settings" resizeWindow={vi.fn()} />);

    await user.keyboard("{Escape}");

    expect(screen.getByTestId("panel")).toBeInTheDocument();
    expect(screen.queryByTestId("settings")).not.toBeInTheDocument();
    await screen.findByLabelText("Ask side-pilot");
  });

  it("collapses to the bubble when close is clicked in settings", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="settings" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /collapse/i }));

    expect(screen.queryByTestId("settings")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open side-pilot/i }),
    ).toBeInTheDocument();
  });

  it("moves focus to the Back control when settings opens", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /open settings/i }));

    expect(screen.getByRole("button", { name: /back/i })).toHaveFocus();
  });

  it("restores focus to the gear control when leaving settings", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="settings" resizeWindow={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(
      screen.getByRole("button", { name: /open settings/i }),
    ).toHaveFocus();
    await screen.findByLabelText("Ask side-pilot");
  });

  it("does NOT resize the OS window when switching between the panel and settings views", async () => {
    const user = userEvent.setup();
    const resizeWindow = vi.fn();
    render(<Bubble initialState="expanded" resizeWindow={resizeWindow} />);

    // Mount resizes once (into the panel). After that, switching among
    // non-collapsed views must preserve whatever size the user dragged the
    // window to, so no further resize calls should fire.
    resizeWindow.mockClear();

    await user.click(screen.getByRole("button", { name: /open settings/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(resizeWindow).not.toHaveBeenCalled();
    await screen.findByLabelText("Ask side-pilot");
  });

  it("collapses when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<Bubble initialState="expanded" resizeWindow={vi.fn()} />);
    expect(screen.getByTestId("panel")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("resizes the OS window on mount and when crossing the bubble/panel boundary", async () => {
    const user = userEvent.setup();
    const resizeWindow = vi.fn();
    render(<Bubble resizeWindow={resizeWindow} />);

    expect(resizeWindow).toHaveBeenLastCalledWith("collapsed");

    // Expanding from the bubble crosses the boundary, so it resizes.
    await user.click(screen.getByRole("button", { name: /open side-pilot/i }));
    expect(resizeWindow).toHaveBeenLastCalledWith("expanded");

    // Minimizing back to the bubble crosses the boundary again.
    await user.click(screen.getByRole("button", { name: /minimize/i }));
    expect(resizeWindow).toHaveBeenLastCalledWith("collapsed");
  });

  it("marks a drag region so the window can be moved", () => {
    const { container } = render(<Bubble resizeWindow={vi.fn()} />);
    expect(container.querySelector("[data-tauri-drag-region]")).not.toBeNull();
  });
});
