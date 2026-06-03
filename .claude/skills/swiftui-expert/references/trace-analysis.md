# Instruments Trace Analysis Reference

Enables analysis of Xcode Instruments `.trace` files for SwiftUI performance investigation. Requires Python 3 and `xctrace` (bundled with Xcode).

## Activation Triggers

Invoke trace analysis when users mention:
- File paths ending in `.trace`
- Performance issues ("hangs," "hitches," "jank," "slow view") with Instruments recordings
- Time-window focus requests ("after/before/between/during" a log or signpost)

## Four CLI Modes

**1. Full Analysis (Default)**
```bash
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" \
  --trace "/path/to/file.trace" \
  --top 10 --top-hitches 5 \
  [--window START_MS:END_MS] \
  --json-only
```

**2. Log Discovery** — filters os_log entries by subsystem, category, type, message:
```bash
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
    --list-logs --log-message-contains "loaded feed" --log-limit 5
```

**3. Signpost Discovery** — locates interval pairs and single-point events:
```bash
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
    --list-signposts --signpost-name-contains "ImageDecode"
```

**4. Fan-in Analysis** — identifies which nodes repeatedly invalidate a specific view:
```bash
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
    --fanin-for "<ViewName>"
```

## Key Diagnostic: `main_running_coverage_pct`

| Value | Interpretation |
|-------|----------------|
| < 25% | Main thread was blocked (I/O, lock, sync XPC, `Task.sleep`) — move work off main |
| ≥ 75% | CPU-bound main-thread execution — optimize hot symbols directly |
| 25–75% | Mixed computation and intermittent blocking |

## High-Severity SwiftUI Events

Route findings by event type:
- `onChange` / `Gesture` handlers → `references/performance-patterns.md`
- View `Creation`/`Update` → `references/view-structure.md`
- `Layout` issues → `references/layout-best-practices.md`

## Cause Graph Patterns

Watch for structural bugs:
- **`UserDefaultObserver`** — `@AppStorage` feedback storm
- **`EnvironmentWriter`** — over-applied modifiers
- **View Creation/Reuse** — ID instability or type erasure

## Output Structure

1. One-line summary with hang, hitch, and high-severity event counts
2. Root-cause findings ordered by actionability
3. Numbered plan with file-specific edits and line citations

## Scoping a Time Window

```bash
# Find log that marks the region of interest
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
    --list-logs --log-message-contains "loaded feed" --log-limit 5

# Run analysis on that window
python3 ".claude/skills/swiftui-expert/scripts/analyze_trace.py" --trace <path> \
    --json-only --top 10 --window 10400:11700
```
