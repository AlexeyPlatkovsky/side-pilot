import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type {
  AdapterResult,
  ChatApi,
  PersistedMessage,
  PersistedSession,
} from "../chat/api";
import { ASSISTANT_MODEL, assistantModelLabel } from "../chat/config";

const SESSION: PersistedSession = {
  id: "s1",
  title: null,
  createdAt: 1,
  updatedAt: 1,
  codexSessionId: null,
};

function persisted(
  over: Partial<PersistedMessage> & Pick<PersistedMessage, "sender" | "content">,
): PersistedMessage {
  return {
    id: over.id ?? `${over.sender}-${over.content}`,
    sessionId: "s1",
    seq: over.seq ?? 1,
    assistantId: over.assistantId ?? (over.sender === "assistant" ? "codex" : null),
    rawJson: over.rawJson ?? null,
    createdAt: 1,
    ...over,
  };
}

/** Build a fake ChatApi with overridable behavior and spies. */
function makeApi(opts: {
  history?: PersistedMessage[];
  sessions?: PersistedSession[];
  runAdapter?: ChatApi["runAdapter"];
  readHistory?: ChatApi["readHistory"];
} = {}): ChatApi {
  return {
    listSessions: vi.fn(() => Promise.resolve(opts.sessions ?? [SESSION])),
    createSession: vi.fn((title = null) =>
      Promise.resolve({ ...SESSION, id: "new-session", title }),
    ),
    readHistory: opts.readHistory ?? vi.fn(() => Promise.resolve(opts.history ?? [])),
    appendMessage: vi.fn((m) =>
      Promise.resolve(persisted({ sender: m.sender, content: m.content })),
    ),
    runAdapter:
      opts.runAdapter ??
      vi.fn(() =>
        Promise.resolve<AdapterResult>({
          assistantText: "ok",
          rawJson: "{}",
          nativeSessionId: null,
        }),
      ),
    renameSession: vi.fn((sessionId, title) =>
      Promise.resolve({ ...SESSION, id: sessionId, title }),
    ),
    deleteSession: vi.fn(() => Promise.resolve()),
    clearSession: vi.fn((sessionId) =>
      Promise.resolve({ ...SESSION, id: sessionId, codexSessionId: null }),
    ),
    updateCodexSessionId: vi.fn(() => Promise.resolve()),
  };
}

/** Wait until the mount effect has loaded the session (so submit is armed). */
async function waitForReady(api: ChatApi) {
  await waitFor(() => expect(api.readHistory).toHaveBeenCalled());
  // Flush the microtask that sets the active session before the loaded dispatch.
  await screen.findByLabelText("Ask side-pilot");
}

describe("ChatPanel", () => {
  it("reloads persisted history on mount", async () => {
    const api = makeApi({
      history: [
        persisted({ sender: "user", content: "earlier question" }),
        persisted({ sender: "assistant", content: "earlier answer", seq: 2 }),
      ],
    });
    render(<ChatPanel api={api} />);

    expect(await screen.findByText("earlier question")).toBeInTheDocument();
    expect(screen.getByText("earlier answer")).toBeInTheDocument();
  });

  it("shows the submitted user message immediately and renders the Markdown reply", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runAdapter: vi.fn(() =>
        Promise.resolve<AdapterResult>({
          assistantText: "Here is **bold** advice",
          rawJson: "{}",
          nativeSessionId: "thread-1",
        }),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "what next?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // User message appears right away.
    expect(screen.getByText("what next?")).toBeInTheDocument();
    // Assistant Markdown is rendered (bold => <strong>).
    const strong = await screen.findByText("bold");
    expect(strong.tagName).toBe("STRONG");
    // Native Codex session id is recorded for resume.
    await waitFor(() =>
      expect(api.updateCodexSessionId).toHaveBeenCalledWith("s1", "thread-1"),
    );
  });

  it("shows a thinking indicator while the run is blocking", async () => {
    const user = userEvent.setup();
    let resolveRun!: (r: AdapterResult) => void;
    const api = makeApi({
      runAdapter: vi.fn(
        () =>
          new Promise<AdapterResult>((resolve) => {
            resolveRun = resolve;
          }),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "slow one");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByTestId("thinking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();

    resolveRun({ assistantText: "done", rawJson: "{}", nativeSessionId: null });

    await waitFor(() =>
      expect(screen.queryByTestId("thinking")).not.toBeInTheDocument(),
    );
  });

  it("surfaces an error without losing the user's message", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runAdapter: vi.fn(() => Promise.reject({ kind: "notAuthenticated" })),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "do a thing");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not authenticated/i);
    // The user's message survives the failure.
    expect(screen.getByText("do a thing")).toBeInTheDocument();
  });

  it("does not render raw HTML embedded in an assistant reply (XSS-safe)", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runAdapter: vi.fn(() =>
        Promise.resolve<AdapterResult>({
          assistantText: "<img src=x onerror=alert(1)> safe text",
          rawJson: "{}",
          nativeSessionId: null,
        }),
      ),
    });
    const { container } = render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "render this");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText(/safe text/);
    // react-markdown does not pass raw HTML through, so no <img> is injected.
    expect(container.querySelector("img")).toBeNull();
  });

  it("disables Send for an empty draft", async () => {
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("keeps the composer compact before and during one-line input", async () => {
    const user = userEvent.setup();
    const scrollHeight = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.value ? 24 : 96;
      },
    });

    try {
      const api = makeApi();
      render(<ChatPanel api={api} />);
      await waitForReady(api);

      const input = screen.getByLabelText("Ask side-pilot");
      expect(input).toHaveStyle({ height: "32px" });

      await user.type(input, "a");

      expect(input).toHaveStyle({ height: "32px" });
    } finally {
      if (scrollHeight) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          scrollHeight,
        );
      } else {
        Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
      }
    }
  });

  it("remeasures composer height when the app width changes", async () => {
    const user = userEvent.setup();
    let measuredScrollHeight = 32;
    const scrollHeight = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return measuredScrollHeight;
      },
    });

    try {
      const api = makeApi();
      render(<ChatPanel api={api} />);
      await waitForReady(api);

      const input = screen.getByLabelText("Ask side-pilot");
      await user.type(input, "long text that fits one row while wide");
      expect(input).toHaveStyle({ height: "32px" });

      measuredScrollHeight = 56;
      window.dispatchEvent(new Event("resize"));
      expect(input).toHaveStyle({ height: "56px" });

      measuredScrollHeight = 32;
      window.dispatchEvent(new Event("resize"));
      expect(input).toHaveStyle({ height: "32px" });
    } finally {
      if (scrollHeight) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          scrollHeight,
        );
      } else {
        Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
      }
    }
  });

  it("badges assistant replies with the model and effort", async () => {
    const api = makeApi({
      history: [persisted({ sender: "assistant", content: "hi from gpt" })],
    });
    render(<ChatPanel api={api} />);

    const message = (await screen.findByText("hi from gpt")).closest(
      ".message",
    ) as HTMLElement;
    expect(within(message).getByText(assistantModelLabel)).toBeInTheDocument();
    // The brand badge is GPT, never "Codex".
    expect(within(message).queryByText(/codex/i)).not.toBeInTheDocument();
  });

  it("does not label user messages with 'You'", async () => {
    const api = makeApi({
      history: [persisted({ sender: "user", content: "my question" })],
    });
    render(<ChatPanel api={api} />);

    const message = (await screen.findByText("my question")).closest(
      ".message",
    ) as HTMLElement;
    expect(within(message).queryByText("You")).not.toBeInTheDocument();
    expect(message.querySelector(".message__label")).toBeNull();
  });

  it("sends the configured model and reasoning effort to the adapter", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "go");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(api.runAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          model: ASSISTANT_MODEL.id,
          reasoningEffort: ASSISTANT_MODEL.effort,
        }),
      ),
    );
  });

  it("toggles the chat history rail and keeps the active draft", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "keep me");
    // Rail starts hidden; the toggle is always available.
    expect(screen.queryByRole("complementary", { name: "Chat history" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    expect(
      screen.getByRole("complementary", { name: "Chat history" }),
    ).toBeInTheDocument();
    // Opening the rail must not reset the draft.
    expect(screen.getByLabelText("Ask side-pilot")).toHaveValue("keep me");

    await user.click(screen.getByRole("button", { name: "Hide chat history" }));
    expect(screen.queryByRole("complementary", { name: "Chat history" })).toBeNull();
    expect(screen.getByLabelText("Ask side-pilot")).toHaveValue("keep me");
  });

  it("titles an untitled chat from its first prompt", async () => {
    const user = userEvent.setup();
    const api = makeApi(); // SESSION.title is null
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.type(screen.getByLabelText("Ask side-pilot"), "Explain JS closures");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(api.renameSession).toHaveBeenCalledWith("s1", "Explain JS closures"),
    );
  });

  it("switches to another chat from the rail and loads its history", async () => {
    const user = userEvent.setup();
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      readHistory: vi.fn((id: string) =>
        Promise.resolve(
          id === "s2"
            ? [persisted({ id: "m2", sender: "user", content: "from chat two" })]
            : [],
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: "Two" }));

    expect(await screen.findByText("from chat two")).toBeInTheDocument();
    expect(api.readHistory).toHaveBeenCalledWith("s2");
  });

  it("does not place a late reply into a chat the user switched to mid-request", async () => {
    const user = userEvent.setup();
    let resolveAdapter!: (result: AdapterResult) => void;
    const adapterPromise = new Promise<AdapterResult>((resolve) => {
      resolveAdapter = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      runAdapter: vi.fn(() => adapterPromise),
      readHistory: vi.fn((id: string) =>
        Promise.resolve(
          id === "s2"
            ? [persisted({ id: "m2", sender: "user", content: "from chat two" })]
            : [],
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Submit a prompt in chat One; the reply is still in flight.
    await user.type(screen.getByLabelText("Ask side-pilot"), "ask one");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // Switch to chat Two while One's reply is pending.
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(await screen.findByText("from chat two")).toBeInTheDocument();

    // The late reply resolves; it is persisted but must not appear in chat Two.
    resolveAdapter({ assistantText: "REPLY-ONE", rawJson: "{}", nativeSessionId: null });
    await waitFor(() =>
      expect(api.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ sender: "assistant" }),
      ),
    );
    expect(screen.queryByText("REPLY-ONE")).not.toBeInTheDocument();
    expect(screen.getByText("from chat two")).toBeInTheDocument();
  });

  it("clears the active chat after confirmation and resets the transcript", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      history: [persisted({ sender: "user", content: "old message" })],
    });
    render(<ChatPanel api={api} />);
    expect(await screen.findByText("old message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear chat" }));
    const dialog = screen.getByRole("dialog", { name: "Clear chat" });
    await user.click(within(dialog).getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(api.clearSession).toHaveBeenCalledWith("s1"));
    await waitFor(() =>
      expect(screen.queryByText("old message")).not.toBeInTheDocument(),
    );
  });

  it("does not clear the chat when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      history: [persisted({ sender: "user", content: "old message" })],
    });
    render(<ChatPanel api={api} />);
    expect(await screen.findByText("old message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear chat" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );

    expect(api.clearSession).not.toHaveBeenCalled();
    expect(screen.getByText("old message")).toBeInTheDocument();
  });

  it("closes the clear confirmation on Escape without clearing", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      history: [persisted({ sender: "user", content: "old message" })],
    });
    render(<ChatPanel api={api} />);
    expect(await screen.findByText("old message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear chat" }));
    expect(screen.getByRole("dialog", { name: "Clear chat" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.clearSession).not.toHaveBeenCalled();
    expect(screen.getByText("old message")).toBeInTheDocument();
  });
});
