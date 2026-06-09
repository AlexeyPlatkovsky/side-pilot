import { describe, it, expect, vi } from "vitest";
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type {
  ChatApi,
  PersistedMessage,
  PersistedSession,
  RouteRequest,
  RouteRunResult,
} from "../chat/api";
import type { AssistantId } from "../chat/generated/AssistantId";
import type { AdapterError } from "../chat/generated/AdapterError";

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
    model: over.model ?? (over.sender === "assistant" ? "gpt-5.5" : null),
    reasoningEffort: over.reasoningEffort ?? (over.sender === "assistant" ? "low" : null),
    rawJson: over.rawJson ?? null,
    isError: over.isError ?? false,
    createdAt: 1,
    ...over,
  };
}

interface OutcomeSpec {
  provider: AssistantId;
  content?: string;
  error?: AdapterError;
}

/** Build a RouteRunResult from a compact outcome spec. */
function routeResult(prompt: string, outcomes: OutcomeSpec[]): RouteRunResult {
  return {
    userMessage: persisted({ sender: "user", content: prompt, seq: 1 }),
    outcomes: outcomes.map((o, i) => ({
      provider: o.provider,
      message: o.error
        ? undefined
        : persisted({
            id: `a-${o.provider}`,
            sender: "assistant",
            assistantId: o.provider,
            content: o.content ?? "ok",
            seq: i + 2,
          }),
      error: o.error,
    })),
  };
}

/** Build a fake ChatApi with overridable behavior and spies. */
function makeApi(
  opts: {
    history?: PersistedMessage[];
    sessions?: PersistedSession[];
    runRoute?: ChatApi["runRoute"];
    readHistory?: ChatApi["readHistory"];
    retryRoute?: ChatApi["retryRoute"];
  } = {},
): ChatApi {
  return {
    listSessions: vi.fn(() => Promise.resolve(opts.sessions ?? [SESSION])),
    createSession: vi.fn((title = null) =>
      Promise.resolve({ ...SESSION, id: "new-session", title }),
    ),
    readHistory: opts.readHistory ?? vi.fn(() => Promise.resolve(opts.history ?? [])),
    appendMessage: vi.fn((m) =>
      Promise.resolve(persisted({ sender: m.sender, content: m.content })),
    ),
    runAdapter: vi.fn(() =>
      Promise.resolve({ assistantText: "ok", rawJson: "{}", nativeSessionId: null }),
    ),
    runRoute:
      opts.runRoute ??
      vi.fn((req: RouteRequest) =>
        Promise.resolve(routeResult(req.prompt, [{ provider: "codex", content: "ok" }])),
      ),
    retryRoute:
      opts.retryRoute ??
      vi.fn(
        (): Promise<import("../chat/api").ProviderRunOutcome> =>
          Promise.resolve({
            provider: "codex" as const,
            message: persisted({ sender: "assistant", content: "retried" }),
          }),
      ),
    getProviderPreferences: vi.fn(() => Promise.reject(new Error("unused"))),
    updateProviderPreferences: vi.fn(() => Promise.reject(new Error("unused"))),
    getGeneralPreferences: vi.fn(() => Promise.reject(new Error("unused"))),
    updateGeneralPreferences: vi.fn(() => Promise.reject(new Error("unused"))),
    renameSession: vi.fn((sessionId, title) =>
      Promise.resolve({ ...SESSION, id: sessionId, title }),
    ),
    deleteSession: vi.fn(() => Promise.resolve()),
    clearSession: vi.fn((sessionId) =>
      Promise.resolve({ ...SESSION, id: sessionId, codexSessionId: null }),
    ),
    updateCodexSessionId: vi.fn(() => Promise.resolve()),
    openExternal: vi.fn(() => Promise.resolve()),
    detectClis: vi.fn(() => Promise.resolve([])),
    getCliIntegrations: vi.fn(() => Promise.reject(new Error("unused"))),
    updateCliIntegrations: vi.fn(() => Promise.reject(new Error("unused"))),
  };
}

/** Wait until the mount effect has loaded the session (so submit is armed). */
async function waitForReady(api: ChatApi) {
  await waitFor(() => expect(api.readHistory).toHaveBeenCalled());
  await screen.findByLabelText("Ask side-pilot");
}

async function send(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.type(screen.getByLabelText("Ask side-pilot"), prompt);
  await user.click(screen.getByRole("button", { name: /^send/i }));
}

describe("[smoke] ChatPanel", () => {
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
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "codex", content: "Here is **bold** advice" },
          ]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "what next?");

    expect(screen.getByText("what next?")).toBeInTheDocument();
    const strong = await screen.findByText("bold");
    expect(strong.tagName).toBe("STRONG");
    await waitFor(() => expect(api.runRoute).toHaveBeenCalled());
  });

  it("shows a thinking indicator while the run is blocking", async () => {
    const user = userEvent.setup();
    let resolveRun!: (r: RouteRunResult) => void;
    const api = makeApi({
      runRoute: vi.fn(
        () => new Promise<RouteRunResult>((resolve) => (resolveRun = resolve)),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "slow one");

    expect(await screen.findByTestId("thinking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send/i })).toBeDisabled();

    resolveRun(routeResult("slow one", [{ provider: "codex", content: "done" }]));

    await waitFor(() => expect(screen.queryByTestId("thinking")).not.toBeInTheDocument());
  });

  it("shows an inline error card for a failed provider slot and re-enables Send", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "codex", error: { kind: "notAuthenticated" } },
          ]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "do a thing");

    const card = await screen.findByTestId("provider-error");
    expect(card).toHaveTextContent(/not authenticated/i);
    // The user's message survives the failure.
    expect(screen.getByText("do a thing")).toBeInTheDocument();
    // The run is no longer in flight: the AI switcher re-enables once the slot
    // resolves (Send itself is disabled only because the draft is now empty).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /choose ai provider/i }),
      ).not.toBeDisabled(),
    );
  });

  it("All mode renders a labeled slot per provider; failures show inline cards", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "codex", content: "gpt reply" },
            { provider: "claude", content: "claude reply" },
            { provider: "gemini", error: { kind: "timedOut" } },
          ]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Switch the active route to All via the switcher.
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));

    await send(user, "to all");

    expect(await screen.findByText("gpt reply")).toBeInTheDocument();
    expect(screen.getByText("claude reply")).toBeInTheDocument();
    const errorCard = screen.getByTestId("provider-error");
    expect(errorCard).toHaveAttribute("data-provider", "gemini");
    expect(errorCard).toHaveTextContent(/timed out/i);
    // run_route was asked for the All route with the three active providers.
    expect(api.runRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: { kind: "all" },
        activeProviders: ["codex", "claude", "gemini"],
      }),
    );
  });

  it("clears every All-provider thinking slot when the whole route call fails", async () => {
    const user = userEvent.setup();
    let rejectRoute!: (error: Error) => void;
    const routePromise = new Promise<RouteRunResult>((_, reject) => {
      rejectRoute = reject;
    });
    const api = makeApi({ runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));
    await send(user, "fail everyone");
    expect(screen.getAllByTestId("thinking")).toHaveLength(3);

    rejectRoute(new Error("storage unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent("storage unavailable");
    expect(screen.queryAllByTestId("thinking")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /choose ai provider/i })).toBeEnabled();
  });

  it("does not render raw HTML embedded in an assistant reply (XSS-safe)", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "codex", content: "<img src=x onerror=alert(1)> safe text" },
          ]),
        ),
      ),
    });
    const { container } = render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "render this");

    await screen.findByText(/safe text/);
    expect(container.querySelector(".message__markdown img")).toBeNull();
  });

  it("disables Send for an empty draft", async () => {
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    expect(screen.getByRole("button", { name: /^send/i })).toBeDisabled();
  });

  it("badges assistant replies with the model and effort", async () => {
    const api = makeApi({
      history: [persisted({ sender: "assistant", content: "hi from gpt" })],
    });
    render(<ChatPanel api={api} />);

    const message = (await screen.findByText("hi from gpt")).closest(
      ".message",
    ) as HTMLElement;
    expect(within(message).getByText("gpt-5.5-low")).toBeInTheDocument();
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

  it("lets the backend apply the fixed provider configuration", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "go");

    await waitFor(() =>
      expect(api.runRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: { kind: "single", provider: "codex" },
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
    expect(screen.queryByRole("complementary", { name: "Chat history" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    expect(
      screen.getByRole("complementary", { name: "Chat history" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ask side-pilot")).toHaveValue("keep me");

    await user.click(screen.getByRole("button", { name: "Hide chat history" }));
    expect(screen.queryByRole("complementary", { name: "Chat history" })).toBeNull();
    expect(screen.getByLabelText("Ask side-pilot")).toHaveValue("keep me");
  });

  it("titles an untitled chat from its first prompt", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "Explain JS closures");

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

  it("keeps the selected AI provider scoped to each chat", async () => {
    const user = userEvent.setup();
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: GPT\)/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: GPT\)/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini" }));
    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: Gemini\)/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "One" }));
    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: GPT\)/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(
      screen.getByRole("button", { name: /choose ai provider \(current: Gemini\)/i }),
    ).toBeInTheDocument();
  });

  it("starts a newly created chat on the default GPT provider", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini" }));
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: "New chat" }));

    expect(
      await screen.findByRole("button", {
        name: /choose ai provider \(current: GPT\)/i,
      }),
    ).toBeInTheDocument();
  });

  it("does not place a late reply into a chat the user switched to mid-request", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      runRoute: vi.fn(() => routePromise),
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

    await send(user, "ask one");

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(await screen.findByText("from chat two")).toBeInTheDocument();

    resolveRoute(routeResult("ask one", [{ provider: "codex", content: "REPLY-ONE" }]));
    await waitFor(() => expect(api.runRoute).toHaveBeenCalled());
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

  it("shows a 24h timestamp above each message", async () => {
    const api = makeApi({
      history: [persisted({ sender: "user", content: "hi", createdAt: Date.now() })],
    });
    const { container } = render(<ChatPanel api={api} />);
    expect(await screen.findByText("hi")).toBeInTheDocument();

    const time = container.querySelector(".message__time");
    expect(time).not.toBeNull();
    expect(time?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it("restores the thinking indicator when returning to a chat whose reply is still pending", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "ask one");
    expect(screen.getByTestId("thinking")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    expect(screen.queryByTestId("thinking")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^One/ }));
    expect(screen.getByTestId("thinking")).toBeInTheDocument();
  });

  it("restores every labeled All-provider thinking slot when returning to a pending chat", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));
    await send(user, "ask everyone");
    expect(screen.getAllByTestId("thinking")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /^One/ }));

    const thinking = screen.getAllByTestId("thinking");
    expect(thinking).toHaveLength(3);
    expect(thinking.map((node) => node.dataset.provider)).toEqual([
      "codex",
      "claude",
      "gemini",
    ]);
    expect(screen.getByText("ask everyone")).toBeInTheDocument();
  });

  it("keeps the optimistic prompt when switching away before title generation finishes", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const renamePromise = new Promise<PersistedSession>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: null, updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    api.renameSession = vi.fn(() => renamePromise);
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "prompt before persistence");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(
      screen.getByRole("button", { name: /Untitled chat, reply in progress/ }),
    );

    expect(screen.getByText("prompt before persistence")).toBeInTheDocument();
    expect(screen.getByTestId("thinking")).toBeInTheDocument();
  });

  it("does not duplicate a pending prompt that history has already persisted", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    let s1Reads = 0;
    const api = makeApi({
      sessions,
      runRoute: vi.fn(() => routePromise),
      readHistory: vi.fn((id: string) => {
        if (id !== "s1" || s1Reads++ === 0) return Promise.resolve([]);
        return Promise.resolve([
          persisted({ id: "persisted-prompt", sender: "user", content: "same prompt" }),
        ]);
      }),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "same prompt");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /^One/ }));

    expect(screen.getAllByText("same prompt")).toHaveLength(1);
    expect(screen.getByTestId("thinking")).toBeInTheDocument();
  });

  it("keeps a repeated pending prompt when history only contains the identical prior prompt", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const prior = persisted({
      id: "prior-prompt",
      sender: "user",
      content: "same prompt",
    });
    const api = makeApi({
      sessions,
      history: [prior],
      runRoute: vi.fn(() => routePromise),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "same prompt");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /^One/ }));

    expect(screen.getAllByText("same prompt")).toHaveLength(2);
    expect(screen.getByTestId("thinking")).toBeInTheDocument();
  });

  it("keeps the latest selected chat when history reads settle out of order", async () => {
    const user = userEvent.setup();
    let resolveTwo!: (messages: PersistedMessage[]) => void;
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 3 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 2 },
      { ...SESSION, id: "s3", title: "Three", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      readHistory: vi.fn((id: string) => {
        if (id === "s2") {
          return new Promise<PersistedMessage[]>((resolve) => {
            resolveTwo = resolve;
          });
        }
        if (id === "s3") {
          return Promise.resolve([
            persisted({
              id: "three-message",
              sessionId: "s3",
              sender: "user",
              content: "three",
            }),
          ]);
        }
        return Promise.resolve([]);
      }),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /^Three/ }));
    expect(await screen.findByText("three")).toBeInTheDocument();

    await act(async () => {
      resolveTwo([
        persisted({ id: "two-message", sessionId: "s2", sender: "user", content: "two" }),
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("three")).toBeInTheDocument();
    expect(screen.queryByText("two")).toBeNull();
  });

  it("cancels an in-flight selection when the user reselects the active chat", async () => {
    const user = userEvent.setup();
    let resolveTwo!: (messages: PersistedMessage[]) => void;
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      readHistory: vi.fn((id: string) => {
        if (id === "s2") {
          return new Promise<PersistedMessage[]>((resolve) => {
            resolveTwo = resolve;
          });
        }
        return Promise.resolve([
          persisted({
            id: "one-message",
            sessionId: "s1",
            sender: "user",
            content: "one",
          }),
        ]);
      }),
    });
    render(<ChatPanel api={api} />);
    expect(await screen.findByText("one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /^One/ }));
    await act(async () => {
      resolveTwo([
        persisted({ id: "two-message", sessionId: "s2", sender: "user", content: "two" }),
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.queryByText("two")).toBeNull();
  });

  it("does not activate a deleted chat when its pending history read settles", async () => {
    const user = userEvent.setup();
    let resolveTwo!: (messages: PersistedMessage[]) => void;
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({
      sessions,
      readHistory: vi.fn((id: string) => {
        if (id === "s2") {
          return new Promise<PersistedMessage[]>((resolve) => {
            resolveTwo = resolve;
          });
        }
        return Promise.resolve([
          persisted({
            id: "one-message",
            sessionId: "s1",
            sender: "user",
            content: "one",
          }),
        ]);
      }),
    });
    api.deleteSession = vi.fn((id: string) => {
      const index = sessions.findIndex((session) => session.id === id);
      if (index >= 0) sessions.splice(index, 1);
      return Promise.resolve();
    });
    render(<ChatPanel api={api} />);
    expect(await screen.findByText("one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await user.click(screen.getByRole("button", { name: /Options for Two/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog", { name: /Delete chat/ })).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith("s2"));

    await act(async () => {
      resolveTwo([
        persisted({ id: "two-message", sessionId: "s2", sender: "user", content: "two" }),
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.queryByText("two")).toBeNull();
    expect(screen.queryByRole("button", { name: "Two" })).toBeNull();
  });

  it("keeps independent labeled thinking slots for multiple pending chats", async () => {
    const user = userEvent.setup();
    const routePromise = new Promise<RouteRunResult>(() => {});
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));
    await send(user, "ask everyone");

    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    await send(user, "ask gpt");
    expect(screen.getAllByTestId("thinking")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /^One/ }));
    expect(screen.getAllByTestId("thinking")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /^Two/ }));
    expect(screen.getAllByTestId("thinking")).toHaveLength(1);
  });

  it("does not revive a pending chat after it is deleted and its late result settles", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    api.deleteSession = vi.fn((id: string) => {
      const index = sessions.findIndex((session) => session.id === id);
      if (index >= 0) sessions.splice(index, 1);
      return Promise.resolve();
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));
    await send(user, "ask everyone");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /Options for One/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog", { name: /Delete chat/ })).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith("s1"));

    resolveRoute(
      routeResult("ask everyone", [
        { provider: "codex", content: "late gpt" },
        { provider: "claude", content: "late claude" },
        { provider: "gemini", content: "late gemini" },
      ]),
    );

    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/late (gpt|claude|gemini)/)).toBeNull();
    expect(screen.queryByRole("button", { name: "One" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /unread answer|reply in progress/ }),
    ).toBeNull();
  });

  it("marks a background reply unread in the rail and clears it when reopened", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "ask one");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));

    expect(
      screen.getByRole("button", { name: /One, reply in progress/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Two/ }));
    resolveRoute(routeResult("ask one", [{ provider: "codex", content: "done" }]));
    expect(
      await screen.findByRole("button", { name: /One, unread answer/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /One, unread answer/ }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /One, unread answer/ })).toBeNull(),
    );
  });

  it("restores a background provider error when the unread chat is reopened", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const persistedError = persisted({
      id: "error-gemini",
      sessionId: "s1",
      sender: "assistant",
      assistantId: "gemini",
      content: "Gemini is not authenticated. Sign in to its CLI and try again.",
      seq: 2,
      isError: true,
    });
    let errorPersisted = false;
    const api = makeApi({
      sessions,
      runRoute: vi.fn(() => routePromise),
      readHistory: vi.fn((id: string) =>
        Promise.resolve(id === "s1" && errorPersisted ? [persistedError] : []),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "ask one");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    errorPersisted = true;
    resolveRoute({
      userMessage: persisted({ sender: "user", content: "ask one" }),
      outcomes: [
        {
          provider: "gemini",
          message: persistedError,
          error: { kind: "notAuthenticated" },
        },
      ],
    });

    await user.click(await screen.findByRole("button", { name: /One, unread answer/ }));

    const errorCard = await screen.findByRole("alert");
    expect(errorCard).toHaveTextContent(/Gemini is not authenticated/i);
    expect(errorCard.closest(".message")).toHaveAttribute("data-provider", "gemini");
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

  it("clears a background chat's unread flag when that chat is deleted", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await send(user, "ask one");
    await user.click(screen.getByRole("button", { name: "Show chat history" }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    resolveRoute(routeResult("ask one", [{ provider: "codex", content: "done" }]));
    const unread = await screen.findByRole("button", { name: /One, unread answer/ });

    await user.click(screen.getByRole("button", { name: /Options for One/ }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog", { name: /Delete chat/ })).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith("s1"));
    expect(unread).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unread answer/ })).toBeNull();
  });

  it("surfaces an unread badge on the rail toggle when a background reply lands and the rail is closed", async () => {
    const user = userEvent.setup();
    let resolveRoute!: (r: RouteRunResult) => void;
    const routePromise = new Promise<RouteRunResult>((resolve) => {
      resolveRoute = resolve;
    });
    const sessions: PersistedSession[] = [
      { ...SESSION, id: "s1", title: "One", updatedAt: 2 },
      { ...SESSION, id: "s2", title: "Two", updatedAt: 1 },
    ];
    const api = makeApi({ sessions, runRoute: vi.fn(() => routePromise) });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    expect(screen.getByRole("button", { name: "Show chat history" })).toBeInTheDocument();

    await send(user, "ask one");
    await user.click(screen.getByRole("button", { name: /^Show chat history/ }));
    await user.click(screen.getByRole("button", { name: /^Two/ }));
    resolveRoute(routeResult("ask one", [{ provider: "codex", content: "done" }]));
    await screen.findByRole("button", { name: /One, unread answer/ });

    await user.click(screen.getByRole("button", { name: "Hide chat history" }));
    expect(
      screen.getByRole("button", { name: /Show chat history, unread/i }),
    ).toBeInTheDocument();
  });

  it("opens an assistant-provided link in the system browser, not the app", async () => {
    const api = makeApi({
      history: [
        persisted({
          sender: "assistant",
          content: "See [the docs](https://example.com/guide) for details.",
        }),
      ],
    });
    render(<ChatPanel api={api} />);

    const link = await screen.findByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://example.com/guide");

    const clickEvent = createEvent.click(link);
    fireEvent(link, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(api.openExternal).toHaveBeenCalledWith("https://example.com/guide");

    const auxEvent = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    fireEvent(link, auxEvent);
    expect(auxEvent.defaultPrevented).toBe(true);
    expect(api.openExternal).toHaveBeenCalledTimes(2);
  });

  it("opens the rename dialog from the toolbar pencil and saves", async () => {
    const user = userEvent.setup();
    const api = makeApi({ sessions: [{ ...SESSION, id: "s1", title: "One" }] });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    await user.click(screen.getByRole("button", { name: "Rename chat" }));
    const dialog = screen.getByRole("dialog", { name: /Rename chat/ });
    const input = within(dialog).getByRole("textbox", { name: /Chat title/ });
    expect(input).toHaveValue("One");

    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.renameSession).toHaveBeenCalledWith("s1", "Renamed"));
  });

  // ---- Retry button ---------------------------------------------------------

  it("shows Retry button on the last single-provider error when AI matches", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [{ provider: "gemini", error: { kind: "timedOut" } }]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Switch to Gemini single mode.
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini" }));

    await send(user, "weather in Antalya");

    // The error card and the Retry button must be visible.
    const errorCard = await screen.findByTestId("provider-error");
    expect(errorCard).toHaveAttribute("data-provider", "gemini");
    expect(errorCard).toHaveTextContent(/timed out/i);
    expect(within(errorCard).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("hides Retry button when the AI does not match the error provider", async () => {
    const api = makeApi({
      history: [
        persisted({
          id: "err-1",
          sender: "assistant",
          assistantId: "gemini",
          content: "Gemini timed out before responding.",
          isError: true,
          seq: 1,
        }),
      ],
      runRoute: vi.fn(() => new Promise<RouteRunResult>(() => {})),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Default route is Codex (GPT), error is from Gemini → no Retry.
    const errorCard = screen.getByTestId("provider-error");
    expect(errorCard).toHaveAttribute("data-provider", "gemini");
    expect(errorCard).toHaveTextContent(/timed out/i);
    expect(errorCard.querySelector('[role="button"]')).toBeNull();
  });

  it("hides Retry button in All mode even when error matches a provider", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "codex", content: "gpt reply" },
            { provider: "gemini", error: { kind: "timedOut" } },
          ]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Switch to All mode.
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^All/ }));

    await send(user, "to all");

    const errorCard = await screen.findByTestId("provider-error");
    expect(errorCard).toHaveAttribute("data-provider", "gemini");
    // Retry button must not appear in All mode.
    expect(errorCard.querySelector('[role="button"]')).toBeNull();
  });

  it("hides Retry button after a successful response pushes error out of last position", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      history: [
        persisted({
          id: "err-1",
          sender: "assistant",
          assistantId: "gemini",
          content: "Gemini timed out before responding.",
          isError: true,
          seq: 1,
        }),
      ],
      runRoute: vi.fn((req: RouteRequest) =>
        Promise.resolve(
          routeResult(req.prompt, [
            { provider: "gemini", content: "here is the weather" },
          ]),
        ),
      ),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Switch to Gemini.
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini" }));

    // Error is last → Retry visible.
    expect(
      within(screen.getByTestId("provider-error")).getByRole("button", {
        name: "Retry",
      }),
    ).toBeInTheDocument();

    // Send a new message that succeeds — error is no longer last.
    await send(user, "retry prompt");

    // Wait for the success message to appear. The old error should now have no
    // Retry button (it's no longer last).
    await screen.findByText("here is the weather");
    expect(
      screen.queryByTestId("provider-error")?.querySelector('[role="button"]'),
    ).toBeNull();
  });

  it("clicking Retry removes the error and dispatches retryRoute", async () => {
    const user = userEvent.setup();
    const errorMessage = persisted({
      id: "err-gemini",
      sender: "assistant",
      assistantId: "gemini",
      content: "Gemini timed out before responding.",
      isError: true,
      seq: 2,
    });
    const userMessage = persisted({
      id: "user-1",
      sender: "user",
      content: "weather in Antalya",
      seq: 1,
    });
    let retryCalled = false;
    const api = makeApi({
      history: [userMessage, errorMessage],
      runRoute: vi.fn(() => new Promise<RouteRunResult>(() => {})),
      retryRoute: vi.fn((): Promise<import("../chat/api").ProviderRunOutcome> => {
        retryCalled = true;
        return Promise.resolve({
          provider: "gemini" as const,
          message: persisted({
            id: "a-retry",
            sender: "assistant",
            assistantId: "gemini",
            content: "fresh answer",
            seq: 3,
          }),
          error: undefined,
        });
      }),
    });
    render(<ChatPanel api={api} />);
    await waitForReady(api);

    // Switch to Gemini so the Retry button is visible.
    await user.click(screen.getByRole("button", { name: /choose ai provider/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini" }));

    const errorCard = screen.getByTestId("provider-error");
    const retryButton = within(errorCard).getByRole("button", { name: "Retry" });
    await user.click(retryButton);

    await waitFor(() => expect(retryCalled).toBe(true));
    expect(api.retryRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        errorMessageId: "err-gemini",
        provider: "gemini",
        prompt: "weather in Antalya",
      }),
    );
  });
});
