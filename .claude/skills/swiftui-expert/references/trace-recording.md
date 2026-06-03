# Recording an Instruments Trace

Use `scripts/record_trace.py` to record Xcode Instruments `.trace` files. Wraps `xctrace record`.

## Typical Flows

### A) Attach to a running app

```bash
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" \
  --device "Pol's iPhone" \
  --attach "Helm" \
  --output ~/Desktop/helm-session.trace
```

Stop with **Ctrl+C**.

### B) Launch an app from first frame

```bash
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" \
  --device "<UDID>" \
  --launch "/path/to/App.app" \
  --output ~/Desktop/launch.trace
```

### C) Agent-driven: background + stop-file

```bash
# Start (background)
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" \
  --attach Helm --stop-file /tmp/stop-trace \
  --output ~/Desktop/session.trace

# Stop cleanly
touch /tmp/stop-trace
```

### D) Time-boxed recording

```bash
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" \
  --attach Helm --time-limit 30s --output ~/Desktop/30s.trace
```

## Discovery Helpers

```bash
# List connected devices
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" --list-devices

# List all Instruments templates
python3 ".claude/skills/swiftui-expert/scripts/record_trace.py" --list-templates
```

## Picking a Template

**Hard rule: the `SwiftUI` template only populates the SwiftUI lane on a real device or the host Mac. On iOS Simulator, the SwiftUI lane is empty — switch to `Time Profiler`.**

| Target | Template |
|--------|----------|
| Physical iOS/iPadOS device | `SwiftUI` (default) |
| Host Mac (macOS app) | `SwiftUI` (default) |
| iOS / iPadOS Simulator | `Time Profiler` |

Always confirm the target kind with `--list-devices` first.

## Failure Modes

- **Device offline** — shows in `devices offline`; connect/unlock and retry
- **Output path exists** — script refuses to overwrite; pick new path or delete existing
- **App not running (for `--attach`)** — fall back to `--launch` or ask user to open app first
- **Signing / trust on device** — requires a development build signed with user's team
