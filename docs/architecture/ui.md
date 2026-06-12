# UI Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## React Component Tree & Data Flow

```
App
 └─ Bubble (Bubble.tsx)
     ├─ uses bubbleReducer       # collapsed / expanded / settings
     ├─ retains per-session routes across ChatPanel unmounts
     ├─ retains useChat controller across collapse/settings
     ├─ injects ChatApi           # tauriChatApi | inertChatApi
     ├─ Escape handler            # steps back one level
     ├─ click-vs-drag discriminator  # wasDragged() threshold
      ├─ Settings (Settings.tsx)
       │   ├─ section rail          # 7 tabs (tablist pattern, keyboard nav)
       │   ├─ GeneralSettings       # always-on-top, position mode, language (SP-037)
       │   ├─ CliIntegrationsSettings # CLI status, enable/disable, re-check; Add/custom rows/Delete + toast (SP-038/SP-072)
       │   │   ├─ AddCliDialog       # name + command, validation, Test/Save (SP-072)
       │   │   └─ Toast              # 3s auto-dismiss max-3 notice (SP-072)
       │   ├─ ThemesSettings        # radio group for all registered themes with palette swatches; persists via updateGeneralPreferences (SP-041/SP-043)
       │   └─ content placeholder   # for sections not yet implemented
      └─ ChatPanel (ChatPanel.tsx)
          ├─ uses chatReducer      # messages[] (incl. pending/error slots), status
          ├─ uses useChat(api)     # session list, active session, pending/unread sets
          ├─ per-session route state # ActiveRoute per chat: single provider | All (default GPT)
          ├─ toolbar               # model label, Rename, Clear
          ├─ transcript            # Markdown replies, per-provider pending slots, inline error cards
          ├─ composer              # textarea + AiSwitcher + Send (hidden when all providers disabled)
          ├─ AiSwitcher            # provider-logo button + vertical picker; lists enabledProviders incl. custom CLIs (SP-038/SP-072)
          ├─ ChatHistory           # session rail (aside)
          └─ Dialogs               # RenameDialog, DeleteDialog, ClearDialog
```

### State Ownership

| State | Owner | Type |
|---|---|---|
| Bubble visibility | `useReducer(bubbleReducer)` in `Bubble` | `"collapsed" \| "expanded" \| "settings"` |
| Transcript messages | `useReducer(chatReducer)` in shell-retained `useChat` | `ChatMessage[]` |
| Chat status | `useReducer(chatReducer)` in `useChat` | `{ kind: "idle" \| "pending" \| "error"; message?: string }` |
| Session list | `useState` in `useChat` | `PersistedSession[]` |
| Active session id | `useState` in `useChat` | `string \| null` |
| Pending set | `useState` in `useChat` | `Set<sessionId>` |
| Pending turns | `useRef` in `useChat` | Session-id keyed optimistic prompt plus labeled provider slots; restores the complete in-flight turn after chat switches |
| Unread set | `useState` in `useChat` | `Set<sessionId>` |
| Active routes | `useState` in `Bubble`, passed into `ChatPanel` | Session-id keyed `ActiveRoute` values (`{single, provider}` \| `{all}`); retained across collapse/reopen, each chat defaults to GPT |
| Picker open | `useState` in `AiSwitcher` | `boolean` (rendered only while not in flight) |
| Enabled providers | `useState` in `ChatPanel`, loaded from `getCliIntegrations()` | `AssistantId[]` (initialised to `ALL_PROVIDER_IDS` so the loading window never blocks the composer; updated async; empty = all disabled → composer hidden) |

### Data Flow for Prompt Submission (SP-017 multi-provider route)

```
User types prompt → onSubmit() in ChatPanel (with the active route)
  → dispatch({ type: "routeSubmit" })  # optimistic user message + one pending slot per target provider, status → pending
  → generateTitle() + api.renameSession()  # name an untitled chat from its first prompt
  → api.runRoute({ sessionId, route, prompt, activeProviders })
        # Tauri IPC → run_route: persists prompt, computes each provider's
        # unsent diff (transcript replay, §6), dispatches single or All
        # (concurrently), snapshots each provider's global model/reasoning,
        # persists each reply, records message_provider_sends
  → map persisted outcomes → reply messages (success) or inline error cards (failure)
  → dispatch({ type: "routeSettled" })  # swap pending slots for results, status → idle
```

The submit path routes through `run_route` (SP-016), so conversation context is carried by app-owned transcript replay rather than native session resume; the client no longer calls `appendMessage`/`updateCodexSessionId` itself. Per-provider failures are persisted as display-only message rows and arrive inside the outcomes as inline error cards (not a banner), so switching away and reopening the chat restores them from history. Non-zero CLI exits show a useful diagnostic summary capped at 240 characters instead of raw stack traces or report dumps. The last error card in a single-provider chat shows a **Retry** button when the selected AI matches the error's provider; clicking it deletes the error row and re-dispatches the preceding user prompt via `retry_route`. The error banner remains only for a whole-call (storage) failure on the catch path. Late outcomes (success or failure) in a background chat mark it unread until the user opens it.

`Bubble` owns the live `useChat` controller so collapse and the settings view can
temporarily unmount `ChatPanel` without losing in-flight requests, pending/unread
status, or the active transcript. While a route is pending, `useChat` also keeps
the optimistic prompt and labeled provider slots per session; switching back
reconstructs the complete turn. A snapshot of known persisted message ids
distinguishes a newly persisted prompt from an identical earlier prompt, so
neither is lost or duplicated.
Pending-turn metadata is removed on success, whole-call failure, delete, and
clear. Session history reads use latest-selection-wins ordering so a slow earlier
read cannot replace the chat the user selected afterward, and deleting its
selection target invalidates the pending activation.

### Source Files

| File | Role |
|---|---|
| `src/App.tsx` | Root — renders `<Bubble>` with `tauriChatApi`; reads saved theme on startup and applies via `applyTheme()` (SP-041) |
| `src/theme.ts` | Theme constants (`THEMES`, `THEME_LABELS`, `THEME_SWATCHES`), `ThemeId`, `isValidTheme`, `applyTheme` — sets/removes `data-theme` on `<html>` (SP-041) |
| `src/main.tsx` | Vite entry point |
| `src/components/Bubble.tsx` | Floating bubble shell: collapsed dot → expanded panel |
| `src/components/Settings.tsx` | Settings view: section rail (tablist) + GeneralSettings + ThemesSettings + placeholder panes (SP-031, SP-037) |
| `src/components/GeneralSettings.tsx` | General settings controls: always-on-top, position mode, pin, language (SP-037) |
| `src/components/ThemesSettings.tsx` | Theme selector pane: radio group for all eight registered themes with decorative palette swatches; applies theme immediately, persists via `updateGeneralPreferences` (SP-041/SP-043) |
| `src/i18n/translations.ts` | Translation strings for en/ru locales, language name map (SP-037) |
| `src/i18n/useI18n.ts` | React hook providing locale-aware `t()` function (SP-037) |
| `src/components/ChatPanel.tsx` | Chat transcript, toolbar, composer, AI switcher, route submission, session management |
| `src/components/AiSwitcher.tsx` | Provider-logo switcher button + vertical picker (All + built-ins + custom CLIs); derives the option list from enabled providers (SP-038/SP-072) |
| `src/components/ProviderIcon.tsx` | Provider logo images + the All grid glyph + the `provider-icon--custom` letter badge for custom CLIs (SP-072) |
| `src/chat/providers.ts` | Provider registry, `ActiveRoute`, route helpers, per-provider labels/errors (custom CLIs use their user name) |
| `src/chat/assistantId.ts` | `AssistantId` union helpers — `isCustomAssistant`, `customName`, `assistantKey` (`"custom:<name>"`), `sameAssistant` (SP-072) |
| `src/components/ChatHistory.tsx` | Session rail: list, rename, delete, new chat |
| `src/components/Dialog.tsx` | Accessible modal dialog (focus trap, Escape) |
| `src/components/RenameDialog.tsx` | Chat rename form inside Dialog |
| `src/components/AddCliDialog.tsx` | Add-a-custom-CLI dialog: name + command fields, inline validation (duplicate name / duplicate base command / reserved token), Test/Save/Cancel with in-flight disabling; built on `Dialog` (SP-072) |
| `src/components/Toast.tsx` | Transient, auto-dismissing toast (`role="status"`); `TOAST_DURATION_MS = 3000` is the project-wide default (SP-072) |
| `src/chat/api.ts` | `ChatApi` interface + Tauri IPC bridge (`tauriChatApi`) |
| `src/chat/cliIntegrationsUtils.ts` | `mergeDetection` (built-in + custom by name), `builtinEntry`, `customEntry`, `enabledProviderIds`, `enabledCount` (SP-038/SP-072) |
| `src/chat/providers.ts` | Provider presentation and persisted model/reasoning badge labels |
| `src/components/CliIntegrationsSettings.tsx` | CLI detection status display, enable/disable toggles, Re-check; plus the Add button, custom rows (status/toggle/Re-check/Delete), max-3 toast, constant "Only 3 CLIs" label, and delete confirmation (SP-038/SP-072) |
| `src/chat/history.ts` | Title generation, relative time, sorting, selection |
| `src/state/bubbleState.ts` | Bubble visual state machine |
| `src/state/chat.ts` | Chat transcript reducer (loaded/submit/success/error) |
| `src/state/drag.ts` | Click-vs-drag discrimination threshold |
| `src/state/windowResize.ts` | Tauri window resize bridge |
| `src/styles.css` | All CSS (design tokens, component styles) |
