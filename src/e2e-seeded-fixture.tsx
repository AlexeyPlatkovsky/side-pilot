// Seeded WebKit e2e fixture (SP-055/056). Loaded only by e2e/seeded.html — never
// bundled into the production app. Unlike the inert fixture, this mounts the real
// expanded panel over a small in-memory ChatApi pre-seeded with two chats and a
// transcript, and whose `runAdapter` resolves after a short delay. That lets the
// WebKit harness exercise the runtime-only visual surfaces jsdom cannot: the
// per-message timestamp/meta row, and the rail's in-progress spinner → unread dot.
import ReactDOM from "react-dom/client";
import { Bubble } from "./components/Bubble";
import type {
  AdapterResult,
  ChatApi,
  NewMessage,
  PersistedMessage,
  PersistedSession,
  RouteRunResult,
} from "./chat/api";
import "./styles.css";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const t0 = Date.now();
const fixtureParams = new URLSearchParams(window.location.search);
const providerPreference = {
  codex: { model: "gpt-5.5", reasoningEffort: "low" },
  claude: { model: "haiku", reasoningEffort: "low" },
  gemini: { model: "gemini-3-flash-preview", reasoningEffort: "none" },
} as const;

const sessions: PersistedSession[] = [
  {
    id: "s1",
    title: "Refactor auth module",
    createdAt: t0 - 3 * HOUR,
    updatedAt: t0 - 3 * MINUTE,
    codexSessionId: null,
  },
  {
    id: "s2",
    title: "Fix login bug",
    createdAt: t0 - 5 * HOUR,
    updatedAt: t0 - 4 * HOUR,
    codexSessionId: null,
  },
];

const messages: Record<string, PersistedMessage[]> = {
  s1: [
    {
      id: "m1",
      sessionId: "s1",
      seq: 1,
      sender: "user",
      assistantId: null,
      model: null,
      reasoningEffort: null,
      content: "How do I add passkey login?",
      rawJson: null,
      isError: false,
      createdAt: t0 - 5 * MINUTE,
    },
    {
      id: "m2",
      sessionId: "s1",
      seq: 2,
      sender: "assistant",
      assistantId: "codex",
      model: providerPreference.codex.model,
      reasoningEffort: providerPreference.codex.reasoningEffort,
      content:
        "Use the WebAuthn API: register a credential, then verify the assertion on sign-in. See the [WebAuthn guide](https://example.com/webauthn) for details.",
      rawJson: "{}",
      isError: false,
      createdAt: t0 - 4 * MINUTE,
    },
  ],
  s2: [],
};

let nextSeq = 100;

const api: ChatApi = {
  getProviderPreferences: () =>
    Promise.resolve({
      codex: { model: "gpt-5.5", reasoning: "low" },
      claude: { model: "haiku", reasoning: "low" },
      gemini: { model: "gemini-3-flash-preview", reasoning: "none" },
    }),
  updateProviderPreferences: (value) => Promise.resolve(value),
  listSessions: () => Promise.resolve(sessions.map((s) => ({ ...s }))),
  createSession: (title = null) => {
    const created: PersistedSession = {
      id: `s${sessions.length + 1}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      codexSessionId: null,
    };
    sessions.push(created);
    messages[created.id] = [];
    return Promise.resolve({ ...created });
  },
  readHistory: (id) => {
    const history = (messages[id] ?? []).map((m) => ({ ...m }));
    const delay =
      fixtureParams.get("slowHistory") === id
        ? Number(fixtureParams.get("historyDelay") ?? 1000)
        : 0;
    return new Promise((resolve) => setTimeout(() => resolve(history), delay));
  },
  appendMessage: (m: NewMessage) => {
    const list = (messages[m.sessionId] ??= []);
    const row: PersistedMessage = {
      id: `m${nextSeq++}`,
      sessionId: m.sessionId,
      seq: list.length + 1,
      sender: m.sender,
      assistantId: m.assistantId ?? null,
      model: m.model ?? null,
      reasoningEffort: m.reasoningEffort ?? null,
      content: m.content,
      rawJson: m.rawJson ?? null,
      isError: false,
      createdAt: Date.now(),
    };
    list.push(row);
    return Promise.resolve({ ...row });
  },
  // Resolve after a short delay so a reply can land while the user is on another
  // chat — driving the in-progress spinner and then the unread dot.
  runAdapter: () =>
    new Promise<AdapterResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            assistantText: "Here is a short reply for the runtime fixture.",
            rawJson: "{}",
            nativeSessionId: "native-1",
          }),
        600,
      ),
    ),
  // Mirrors run_route: persists the prompt + one reply per target provider after
  // a short delay so the switcher's per-provider slots and (in All mode) the
  // multi-slot layout can be exercised in the WebKit harness.
  runRoute: (request) =>
    new Promise<RouteRunResult>((resolve) =>
      setTimeout(() => {
        const list = (messages[request.sessionId] ??= []);
        const userMessage: PersistedMessage = {
          id: `m${nextSeq++}`,
          sessionId: request.sessionId,
          seq: list.length + 1,
          sender: "user",
          assistantId: null,
          model: null,
          reasoningEffort: null,
          content: request.prompt,
          rawJson: null,
          isError: false,
          createdAt: Date.now(),
        };
        list.push(userMessage);
        const targets =
          request.route.kind === "all"
            ? request.activeProviders
            : [request.route.provider];
        const outcomes = targets.map((provider) => {
          if (fixtureParams.get("route") === "error") {
            const row: PersistedMessage = {
              id: `m${nextSeq++}`,
              sessionId: request.sessionId,
              seq: list.length + 1,
              sender: "assistant",
              assistantId: provider,
              model: providerPreference[provider].model,
              reasoningEffort: providerPreference[provider].reasoningEffort,
              content: `${provider === "gemini" ? "Gemini" : provider} exited with an error: Requested entity was not found.`,
              rawJson:
                '{"kind":"nonZeroExit","code":404,"stderr":"Full report available at: /tmp/gemini-error.json\\nModelNotFoundError: Requested entity was not found.\\n at classifyGoogleError (chunk.js:1)"}',
              isError: true,
              createdAt: Date.now(),
            };
            list.push(row);
            return {
              provider,
              message: row,
              error: {
                kind: "nonZeroExit" as const,
                code: 404,
                stderr:
                  "Full report available at: /tmp/gemini-error.json\nModelNotFoundError: Requested entity was not found.\n at classifyGoogleError (chunk.js:1)",
              },
            };
          }
          const row: PersistedMessage = {
            id: `m${nextSeq++}`,
            sessionId: request.sessionId,
            seq: list.length + 1,
            sender: "assistant",
            assistantId: provider,
            model: providerPreference[provider].model,
            reasoningEffort: providerPreference[provider].reasoningEffort,
            content: `A short **${provider}** reply for the runtime fixture.`,
            rawJson: "{}",
            isError: false,
            createdAt: Date.now(),
          };
          list.push(row);
          return { provider, message: row };
        });
        resolve({ userMessage, outcomes });
      }, Number(fixtureParams.get("routeDelay") ?? 600)),
    ),
  renameSession: (id, title) => {
    const s = sessions.find((x) => x.id === id)!;
    s.title = title;
    return Promise.resolve({ ...s });
  },
  deleteSession: (id) => {
    const i = sessions.findIndex((x) => x.id === id);
    if (i >= 0) sessions.splice(i, 1);
    delete messages[id];
    return Promise.resolve();
  },
  clearSession: (id) => {
    const s = sessions.find((x) => x.id === id)!;
    messages[id] = [];
    s.codexSessionId = null;
    return Promise.resolve({ ...s });
  },
  updateCodexSessionId: (id, codexSessionId) => {
    const s = sessions.find((x) => x.id === id);
    if (s) s.codexSessionId = codexSessionId;
    return Promise.resolve();
  },
  openExternal: () => Promise.resolve(),
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Bubble
    initialState={fixtureParams.get("initial") === "collapsed" ? "collapsed" : "expanded"}
    resizeWindow={() => {}}
    chatApi={api}
  />,
);
