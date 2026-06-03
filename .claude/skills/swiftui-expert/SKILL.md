---
name: swiftui-expert
description: Reviews, improves, and implements SwiftUI/AppKit code for side-pilot. Consults topic-specific reference files to catch deprecated APIs, state bugs, layout issues, accessibility gaps, and performance problems. Use when reading, writing, or reviewing SwiftUI code in this project.
---

# Skill: swiftui-expert

## Operating Rules

- Consult `references/latest-apis.md` at the start of every task to avoid deprecated APIs
- Prefer native SwiftUI APIs over UIKit/AppKit bridging unless bridging is necessary
- Focus on correctness and performance; do not enforce specific architectures (MVVM, VIPER, etc.)
- Encourage separating business logic from views for testability without mandating how
- Follow Apple's Human Interface Guidelines — macOS HIG applies to this project
- Only adopt Liquid Glass when explicitly requested by the user (see `references/liquid-glass.md`)
- Surface performance optimizations inline with [opt] markers; do not block implementation or review completion on them
- Use `#available` gating with sensible fallbacks for version-specific APIs
- **Primary target: macOS** — side-pilot is a native macOS floating assistant app; consult `references/macos-scenes.md`, `references/macos-views.md`, `references/macos-window-styling.md` first for window, toolbar, and scene work

## Task Workflow

### Review existing SwiftUI code
- Read the code under review and identify which topics apply
- Flag deprecated APIs (compare against `references/latest-apis.md`)
- Run the Topic Router below for each relevant topic
- Validate `#available` gating and fallback paths for version-specific features

### Improve existing SwiftUI code
- Audit current implementation against the Topic Router topics
- Replace deprecated APIs with modern equivalents from `references/latest-apis.md`
- Refactor hot paths to reduce unnecessary state updates
- Extract complex view bodies into separate subviews
- Suggest image downsampling when `UIImage(data:)` is encountered (optional optimization, see `references/image-optimization.md`)

### Implement new SwiftUI feature
- Design data flow first: identify owned vs injected state
- Structure views for optimal diffing (extract subviews early)
- Apply correct animation patterns (implicit vs explicit, transitions)
- Use `Button` for all tappable elements; add accessibility grouping and labels
- Gate version-specific APIs with `#available` and provide fallbacks

### Record a new Instruments trace
Trigger when the user asks to "record a trace", "profile the app", "capture a session", etc. Full reference: `references/trace-recording.md`.

1. **Confirm target** — attach to a running app, launch an app, or record all processes? If the user didn't say, ask. List connected devices when useful:
   ```bash
   python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" --list-devices
   ```
2. **Pick a template based on target kind** — the `SwiftUI` template populates the SwiftUI lane on any **real device**: a physical iOS/iPadOS device **or the host Mac**. The only exception is the **iOS Simulator**, where the SwiftUI lane comes back empty — switch to `--template "Time Profiler"` in that case. Always check `--list-devices`: `simulators` kind → `Time Profiler`; `devices` kind → default `SwiftUI`. Full decision table in `references/trace-recording.md`.
3. **Start the recording**. For agent-driven sessions where the user says "I'll tell you when I'm done", start in the background and use a stop-file:
   ```bash
   python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" \
       --device "<name|udid>" --attach "<AppName>" \
       --stop-file /tmp/stop-trace --output ~/Desktop/session.trace
   ```
4. **Signal stop** — when the user says they've finished exercising the app, `touch /tmp/stop-trace`.
5. **Analyse** the resulting trace (flow into the "Trace-driven improvement" workflow below).

### Trace-driven improvement (Instruments `.trace` provided)
Trigger whenever the user's request references a `.trace` file. Full reference: `references/trace-analysis.md`.

1. **Scope the analysis.** Ask yourself: does the user want the whole trace, or a slice?
2. **Resolve a window** (only if the user scoped):
   ```bash
   python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
       --list-logs --log-message-contains "loaded feed" --log-limit 5
   ```
3. **Run the main analysis**:
   ```bash
   python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
       --json-only --top 10 [--window START_MS:END_MS]
   ```
4. **Interpret with `references/trace-analysis.md`** — check `main_running_coverage_pct`, `swiftui-causes.top_sources`.
5. **When a specific view shows as expensive**, use `--fanin-for "<view name>"` to get ranked invalidation sources.
6. **Return a prioritised plan.** Cite evidence and route each recommendation to a Topic Router reference.

## Topic Router

Consult the reference file for each topic relevant to the current task:

| Topic | Reference |
|-------|-----------|
| State management | `references/state-management.md` |
| View composition | `references/view-structure.md` |
| Performance | `references/performance-patterns.md` |
| Lists and ForEach | `references/list-patterns.md` |
| Layout | `references/layout-best-practices.md` |
| Sheets and navigation | `references/sheet-navigation-patterns.md` |
| ScrollView | `references/scroll-patterns.md` |
| Focus management | `references/focus-patterns.md` |
| Animations (basics) | `references/animation-basics.md` |
| Animations (transitions) | `references/animation-transitions.md` |
| Animations (advanced) | `references/animation-advanced.md` |
| Accessibility | `references/accessibility-patterns.md` |
| Swift Charts | `references/charts.md` |
| Charts accessibility | `references/charts-accessibility.md` |
| Image optimization | `references/image-optimization.md` |
| Liquid Glass (iOS 26+) | `references/liquid-glass.md` |
| macOS scenes | `references/macos-scenes.md` |
| macOS window styling | `references/macos-window-styling.md` |
| macOS views | `references/macos-views.md` |
| Text patterns | `references/text-patterns.md` |
| Deprecated API lookup | `references/latest-apis.md` |
| Previews | `references/previews.md` |
| Instruments trace analysis | `references/trace-analysis.md` |
| Instruments trace recording | `references/trace-recording.md` |

## Correctness Checklist

These are hard rules — violations are always bugs:

- [ ] `@State` properties are `private`
- [ ] `@Binding` only where a child modifies parent state
- [ ] Passed values never declared as `@State` or `@StateObject` (they ignore updates)
- [ ] `@StateObject` for view-owned objects; `@ObservedObject` for injected
- [ ] iOS 17+: `@State` with `@Observable`; `@Bindable` for injected observables needing bindings
- [ ] `ForEach` uses stable identity (never `.indices` for dynamic content)
- [ ] Constant number of views per `ForEach` element
- [ ] `.animation(_:value:)` always includes the `value` parameter
- [ ] `@FocusState` properties are `private`
- [ ] No redundant `@FocusState` writes inside tap gesture handlers on `.focusable()` views
- [ ] Version-specific APIs gated with `#available` and fallback provided
- [ ] `import Charts` present in files using chart types
- [ ] Previews use self-contained mock data; no dependency on live services or network

## Output Contract

Emit before delivering findings or changes:

`Skill: swiftui-expert - output below`

For review tasks, organize findings by file with file name, line(s), rule violated, and before/after fix. Skip files with no issues. End with a prioritized summary of the most impactful changes.

For implement/improve tasks, make changes directly.

For trace-recording and trace-analysis tasks, emit `Skill: swiftui-expert - output below` followed by:
- Trace file path and time range analyzed
- Top issues ranked by severity (hang ms / hitch ms / update count)
- Prioritized fix plan with file-specific edits and line citations
