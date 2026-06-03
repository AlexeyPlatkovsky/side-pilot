# Idea: macOS Floating Multi-AI Assistant

## Concept

Create a native macOS floating assistant app that provides one unified chat interface for working with multiple AI tools through their local CLI utilities.

The app should work as a small always-available desktop widget: a draggable floating button or bubble that stays above other windows. When clicked or triggered by a global hotkey, it expands into a chat panel. The user can send messages to one selected AI assistant or route the same message to multiple assistants.

The main goal is to create a personal AI control panel for daily work, not an IDE extension and not a browser-based chat.

## Core Use Case

The user can open the assistant from anywhere on macOS, for example while working in VS Code, a browser, notes, documentation, or terminal.

Example flow:

1. The user presses a global hotkey.
2. The floating assistant opens above the current active window.
3. The app detects the active application, for example VS Code.
4. The user writes a prompt in the chat.
5. The user selects a target AI:
   - Codex
   - Claude
   - Gemini
   - All
6. The app calls the corresponding local CLI utility.
7. The response is displayed inside the same unified chat.
8. The app stores the conversation history locally.

## Main Technologies

### Platform

- macOS

### Main Application Stack

- SwiftUI
- AppKit
- Swift
- Xcode

### Local AI Integration

The app should call local CLI tools installed and authenticated on the user's machine:

- OpenAI Codex CLI
- Claude Code CLI
- Gemini CLI

The app should not rely on API keys for the first version. It should use already configured CLI tools.

### Local Storage

- SQLite is preferred for structured chat history, sessions, routing metadata, and settings

### macOS System APIs

Potential APIs and frameworks:

- `NSWorkspace` — detect the active/frontmost application
- `NSWindow` / `NSPanel` — floating assistant window
- `NSPasteboard` — clipboard integration
- Accessibility API / `AXUIElement` — selected text and active UI context
- `ScreenCaptureKit` — screenshots and screen/window capture
- `Process` — run local CLI commands
- `AVFoundation` — text-to-speech
- Speech framework — speech-to-text
- Global hotkey handling through AppKit or a lightweight hotkey library

## UI Concept

The app starts as a small floating bubble.

Behavior:

- Always on top
- Draggable
- Click to expand
- Click again or press Escape to collapse
- Global hotkey to open/close
- Optional menu bar icon

Expanded chat panel:

- Message input
- Model selector
- Slash-command support
- Conversation history
- Response area
- Optional split-view for comparing multiple AI responses

## Slash Commands

Possible command format:

```text
/codex Explain this code
/claude Review this idea
/gemini Suggest alternatives
/all Compare possible solutions
/summarize Create a final recommendation from all answers
```

## AI Routing

The app should have a routing layer that maps user commands to CLI adapters.

Example adapters:

```text
CodexAdapter
ClaudeAdapter
GeminiAdapter
```

Each adapter should handle:

```text
- command construction
- process execution
- stdout/stderr parsing
- error handling
- timeout handling
- session metadata
```

The app should not assume that all CLI tools handle sessions in the same way. Instead, the app should keep its own local chat history and pass relevant context to each tool when needed.

## Session Model

The app should maintain its own internal conversation session.

Example:

```text
Local Session ID: assistant-session-001

Messages:
- User message
- Codex response
- Claude response
- Gemini response
- Final summary
```

For each local session, the app may optionally store external CLI session references:

```text
codex_session_id
claude_session_id
gemini_session_id
```

But the app should not depend on native CLI sessions for the MVP.

## Active Window Context

One of the key future features is context awareness.

The assistant should be able to understand where the user currently works.

Example context:

```text
Active app: VS Code
Window title: PlayForge — Visual Studio Code
Selected text: ...
Clipboard content: ...
Screenshot: optional
```

For VS Code specifically, there are two possible levels of integration:

### Basic Integration

Use macOS APIs to detect:

```text
- active app
- active window title
- selected text if available
- clipboard content
```

### Advanced Integration

Add a companion VS Code extension that sends richer IDE context to the macOS app:

```text
- current file path
- selected text
- full current file content
- workspace root
- opened tabs
- diagnostics
- git diff
- terminal output
```

## MVP Scope

The first version should stay small.

MVP features:

```text
- Native SwiftUI macOS app
- Floating always-on-top bubble
- Expandable chat panel
- Global hotkey to open/close
- Local chat history
- CLI runner through Process
- Support for one CLI first, probably Claude or Codex
- Basic model selector
- Basic slash command routing
```

After MVP:

```text
- Add all three CLI adapters
- Add /all command
- Add response comparison view
- Add active app detection
- Add clipboard integration
- Add selected text support
- Add VS Code companion extension
- Add screenshots
- Add voice input/output
```

## Why SwiftUI

SwiftUI is chosen because this app needs deep native macOS behavior.

The app is not just a web chat. It needs:

```text
- floating windows
- menu bar behavior
- global hotkeys
- macOS permissions
- active window detection
- clipboard access
- accessibility integration
- screen capture
- possible voice input/output
```

SwiftUI with AppKit gives better native macOS integration than a web app, Tauri, or Electron for this specific use case.

## Risks

Main technical risks:

```text
- CLI output formats may change
- CLI tools may not expose stable session handling
- parsing interactive CLI output can be fragile
- macOS Accessibility permissions can be tricky
- selected text extraction may not work reliably in every app
- screen capture requires permissions
- App Store distribution may be complicated because of CLI execution and permissions
```

## Recommended Development Strategy

Build the project step by step:

```text
1. Create a basic SwiftUI macOS app.
2. Add a floating always-on-top window.
3. Add open/close global hotkey.
4. Add a simple chat UI.
5. Add local message history.
6. Add one CLI adapter.
7. Add command routing.
8. Add the second and third CLI adapters.
9. Add /all mode.
10. Add active application detection.
11. Add clipboard and selected text support.
12. Add VS Code companion extension if needed.
```

## Final Product Vision

A personal macOS AI assistant that stays available everywhere, understands the current working context, and lets the user quickly ask Codex, Claude, Gemini, or all of them from one unified floating chat.

It should feel like a lightweight AI command center for macOS.
