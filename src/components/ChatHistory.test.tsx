import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHistory } from "./ChatHistory";
import type { PersistedSession } from "../chat/api";

const HOUR = 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

const session = (over: Partial<PersistedSession>): PersistedSession => ({
  id: over.id ?? "s",
  title: over.title ?? null,
  createdAt: over.createdAt ?? 0,
  updatedAt: over.updatedAt ?? NOW,
  codexSessionId: over.codexSessionId ?? null,
});

function renderHistory(over: Partial<Parameters<typeof ChatHistory>[0]> = {}) {
  const props = {
    sessions: over.sessions ?? [
      session({ id: "a", title: "First chat", updatedAt: NOW - HOUR }),
      session({ id: "b", title: "Second chat", updatedAt: NOW - 2 * HOUR }),
    ],
    activeSessionId: over.activeSessionId ?? "a",
    now: NOW,
    pendingIds: over.pendingIds,
    unreadIds: over.unreadIds,
    onSelect: over.onSelect ?? vi.fn(),
    onNewChat: over.onNewChat ?? vi.fn(),
    onRename: over.onRename ?? vi.fn(),
    onDelete: over.onDelete ?? vi.fn(),
  };
  render(<ChatHistory {...props} />);
  return props;
}

describe("ChatHistory", () => {
  it("renders each chat on one line with a title and a compact relative time", () => {
    renderHistory();
    const first = screen.getByRole("button", { name: "First chat" });
    const row = first.closest(".chat-row") as HTMLElement;
    expect(within(row).getByText("First chat")).toBeInTheDocument();
    // updatedAt = NOW - 1h -> "1h" on the right.
    expect(within(row).getByText("1h")).toBeInTheDocument();
    // Title column carries the ellipsis class so long titles truncate.
    expect(row.querySelector(".chat-row__title")).not.toBeNull();
  });

  it("shows a spinner instead of the time for a chat with a reply in flight", () => {
    renderHistory({ pendingIds: new Set(["a"]) });
    const row = screen
      .getByRole("button", { name: /First chat, reply in progress/ })
      .closest(".chat-row") as HTMLElement;
    expect(row.querySelector(".chat-row__spinner")).not.toBeNull();
    expect(row.querySelector(".chat-row__time")).toBeNull();
    // The other row is unaffected and still shows its relative time.
    expect(screen.getByText("2h")).toBeInTheDocument();
  });

  it("shows an unread dot instead of the time for a chat with an unread answer", () => {
    renderHistory({ unreadIds: new Set(["b"]) });
    const row = screen
      .getByRole("button", { name: /Second chat, unread answer/ })
      .closest(".chat-row") as HTMLElement;
    expect(row.querySelector(".chat-row__unread")).not.toBeNull();
    expect(row.querySelector(".chat-row__time")).toBeNull();
  });

  it("prefers the in-progress spinner over an unread dot for the same chat", () => {
    renderHistory({ pendingIds: new Set(["a"]), unreadIds: new Set(["a"]) });
    const row = screen
      .getByRole("button", { name: /First chat, reply in progress/ })
      .closest(".chat-row") as HTMLElement;
    expect(row.querySelector(".chat-row__spinner")).not.toBeNull();
    expect(row.querySelector(".chat-row__unread")).toBeNull();
  });

  it("marks the active chat with aria-current", () => {
    renderHistory({ activeSessionId: "b" });
    expect(screen.getByRole("button", { name: "Second chat" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "First chat" })).not.toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows an Untitled placeholder for a session with no title", () => {
    renderHistory({
      sessions: [session({ id: "a", title: null })],
    });
    expect(screen.getByRole("button", { name: "Untitled chat" })).toBeInTheDocument();
  });

  it("selects a chat when its row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderHistory({ onSelect });
    await user.click(screen.getByRole("button", { name: "Second chat" }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("starts a new chat from the New chat control", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    renderHistory({ onNewChat });
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("exposes Rename and Delete only through a per-row options menu", async () => {
    const user = userEvent.setup();
    renderHistory();
    // No inline rename/delete affordance on the row itself.
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("closes the options menu on Escape", async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("restores focus to the options trigger when the menu closes on Escape", async () => {
    const user = userEvent.setup();
    renderHistory();
    const trigger = screen.getByRole("button", { name: /Options for First chat/ });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("renames a chat through the rename dialog, prefilled with the title", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHistory({ onRename });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const dialog = screen.getByRole("dialog", { name: /Rename chat/ });
    const input = within(dialog).getByRole("textbox", { name: /Chat title/ });
    expect(input).toHaveValue("First chat");

    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith("a", "Renamed");
  });

  it("disables Save and shows a hint for a title with special symbols", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHistory({ onRename });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const dialog = screen.getByRole("dialog", { name: /Rename chat/ });
    const input = within(dialog).getByRole("textbox", { name: /Chat title/ });
    await user.clear(input);
    await user.type(input, "bad@name");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByText(/letters, digits/i)).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("caps the title input at 40 characters", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHistory({ onRename });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const dialog = screen.getByRole("dialog", { name: /Rename chat/ });
    const input = within(dialog).getByRole("textbox", { name: /Chat title/ });
    await user.clear(input);
    // Attempting to type past the cap is hard-blocked at 40 characters.
    await user.type(input, "a".repeat(41));
    expect(input).toHaveValue("a".repeat(40));
    // 40 valid chars is still saveable.
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("disables Save for an empty title and does not rename on cancel", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHistory({ onRename });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    const dialog = screen.getByRole("dialog", { name: /Rename chat/ });
    const input = within(dialog).getByRole("textbox", { name: /Chat title/ });
    await user.clear(input);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes a chat only after confirmation", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderHistory({ onDelete });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: /Delete chat/ });
    expect(dialog).toHaveTextContent(/Delete this chat and all messages\?/i);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderHistory({ onDelete });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the delete confirmation on Escape without deleting", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderHistory({ onDelete });

    await user.click(screen.getByRole("button", { name: /Options for First chat/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: /Delete chat/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
