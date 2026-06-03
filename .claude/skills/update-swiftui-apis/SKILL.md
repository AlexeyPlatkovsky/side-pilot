---
name: update-swiftui-apis
description: Keeps swiftui-expert/references/latest-apis.md current by scanning Apple's developer documentation for new SwiftUI deprecations and modern replacements. Requires Sosumi MCP. Use when asked to update SwiftUI API references, check for new deprecations, or refresh the SwiftUI expert knowledge base.
---

# Skill: update-swiftui-apis

## Purpose

Systematically scan Apple's SwiftUI documentation to identify deprecated APIs and update `.claude/skills/swiftui-expert/references/latest-apis.md` with modern replacements.

**Requires:** Sosumi MCP (installed). Tools: `searchAppleDocumentation`, `fetchAppleDocumentation`, `fetchAppleVideoTranscript`, `fetchExternalDocumentation`.

## Workflow

### 0. Verify Sosumi MCP

Before any other step, confirm Sosumi MCP is available:

```
searchAppleDocumentation(query: "SwiftUI")
```

If the tool call fails, stop immediately and report `blocked — Sosumi MCP unavailable`. Do not proceed.

### 1. Coverage Review

Read `.claude/skills/swiftui-expert/references/latest-apis.md` and `.claude/skills/update-swiftui-apis/references/scan-manifest.md` to understand:
- Which version segments are already documented (iOS 15+, 16+, 17+, 18+, 26+)
- Which API categories have been recently scanned
- What entries need updating or verification

`scan-manifest.md` is a **read-only input** for this skill. Do not modify it during a run; update it manually outside this workflow when new WWDC sessions or categories are added.

If the user specifies a category subset (e.g., "only Navigation"), limit scanning to those categories from `scan-manifest.md` and note the restricted scope in the output report.

### 2. Documentation Scanning

Use Sosumi MCP tools to scan Apple's documentation:

```
searchAppleDocumentation(query: "SwiftUI deprecated iOS 26")
fetchAppleDocumentation(path: "/documentation/swiftui/...")
fetchAppleVideoTranscript(session: "WWDC25-256")  // "What's new in SwiftUI"
```

**Priority sources:**
- "What's new in SwiftUI" sessions from the most recent WWDC first
- Apple documentation "Availability" sections to confirm iOS version
- The scan-manifest categories: Navigation, Appearance & Styling, State Management, Presentation, Text Input, Layout, Gestures, Accessibility, Animations, Tabs, Previews, Liquid Glass, Scroll & Lists

### 3. Change Analysis

For each finding, categorize as:
- **New deprecation**: not yet in `latest-apis.md`
- **Version correction**: existing entry has wrong iOS version
- **New version segment**: entirely new `iOS XX+` section needed

### 4. Update latest-apis.md

Add entries following the established format:
- Group under the correct `## iOS XX+` section
- Format: `- Replace \`deprecated\` with \`modern\`` for prose
- Add to the Quick Lookup Table: `| Deprecated | Modern | Since |`
- Update the WWDC source note at the top if a new WWDC session was added

### 5. Output Contract

Emit on completion:

`Skill: update-swiftui-apis - output below`

Report:
- Status: completed / blocked (with reason if blocked)
- Number of new deprecations added
- Number of corrections made
- Version segments updated
- WWDC sessions consulted

**If zero WWDC sessions were consulted and zero changes were made**, report status as `blocked` with reason (e.g., Sosumi MCP unavailable, no new content found). Do not emit a `completed` status for a null run.

**Dependency note:** This skill reads and writes `.claude/skills/swiftui-expert/references/latest-apis.md`. If `swiftui-expert` is relocated, this skill must be updated to match the new path.
