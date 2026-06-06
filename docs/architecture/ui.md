# UI Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## React Component Tree & Data Flow

```
App
 └─ Bubble (Bubble.tsx)
     ├─ uses bubbleReducer       # collapsed / expanded / settings
     ├─ injects ChatApi           # tauriChatApi | inertChatApi
     ├─ Escape handler            # steps back one level
     ├─ click-vs-drag discriminator  # wasDragged() threshold
     └─ ChatPanel (ChatPanel.tsx)
         ├─ uses chatReducer      # messages[], status (idle|pending|error)
         ├─ uses useChat(api)     # session list, active session, pending/unread sets
         ├─ toolbar               # model label, Rename, Clear
         ├─ transcript            # Markdown-rendered messages
         ├─ composer              # textarea + Send
         ├─ ChatHistory           # session rail (aside)
         └─ Dialogs               # RenameDialog, DeleteDialog, ClearDialog
```

### State Ownership

| State | Owner | Type |
|---|---|---|
| Bubble visibility | `useReducer(bubbleReducer)` in `Bubble` | `"collapsed" \| "expanded" \| "settings"` |
| Transcript messages | `useReducer(chatReducer)` in `useChat` | `ChatMessage[]` |
| Chat status | `useReducer(chatReducer)` in `useChat` | `{ kind: "idle" \| "pending" \| "error"; message?: string }` |
| Session list | `useState` in `useChat` | `PersistedSession[]` |
| Active session id | `useState` in `useChat` | `string \| null` |
| Pending set | `useState` in `useChat` | `Set<sessionId>` |
| Unread set | `useState` in `useChat` | `Set<sessionId>` |

### Data Flow for Prompt Submission

```
User types prompt → compose() in ChatPanel
  → dispatch({ type: "submit" })   # optimistic user message, status → pending
  → api.appendMessage(user)         # persist user turn
  → generateTitle()                 # name untitled chat from first prompt
  → api.renameSession()             # persist title
  → api.runAdapter(request)         # Tauri IPC → CLI (blocking)
  → api.appendMessage(assistant)    # persist reply
  → dispatch({ type: "success" })   # append reply, status → idle
  → api.updateCodexSessionId()      # save native resume id
```

Late replies (user switched chats mid-flight) land in the originating session's unread set, not the active transcript.

### Source Files

| File | Role |
|---|---|
| `src/App.tsx` | Root — renders `<Bubble>` with `tauriChatApi` |
| `src/main.tsx` | Vite entry point |
| `src/components/Bubble.tsx` | Floating bubble shell: collapsed dot → expanded panel |
| `src/components/ChatPanel.tsx` | Chat transcript, toolbar, composer, session management |
| `src/components/ChatHistory.tsx` | Session rail: list, rename, delete, new chat |
| `src/components/Dialog.tsx` | Accessible modal dialog (focus trap, Escape) |
| `src/components/RenameDialog.tsx` | Chat rename form inside Dialog |
| `src/chat/api.ts` | `ChatApi` interface + Tauri IPC bridge (`tauriChatApi`) |
| `src/chat/config.ts` | Assistant model configuration (id, label, effort) |
| `src/chat/history.ts` | Title generation, relative time, sorting, selection |
| `src/state/bubbleState.ts` | Bubble visual state machine |
| `src/state/chat.ts` | Chat transcript reducer (loaded/submit/success/error) |
| `src/state/drag.ts` | Click-vs-drag discrimination threshold |
| `src/state/windowResize.ts` | Tauri window resize bridge |
| `src/styles.css` | All CSS (design tokens, component styles) |
