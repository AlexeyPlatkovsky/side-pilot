# Accessibility

The chat is a keyboard- and screen-reader-usable surface on both macOS (VoiceOver) and Windows (Narrator).

## Hard rules
- Interactive elements are real controls: `<button>` for actions, `<a>` for links. Don't put click handlers on `<div>`/`<span>` without `role` + keyboard handling.
- Every control has an accessible name (visible label, `aria-label`, or `aria-labelledby`).
- Inputs have associated `<label>`s.
- Focus order is logical; focus is visible (don't remove focus outlines without an equivalent).
- The send action works from the keyboard (Enter to send; Shift+Enter for newline is fine), not mouse-only.

## Chat specifics
- New assistant responses should be announced — use an `aria-live="polite"` region for incoming messages so screen-reader users hear replies.
- Loading ("thinking…") and error states are conveyed as text/ARIA, not color alone.
- Color contrast meets WCAG AA for message text on the bubble/panel background.

## Review checklist
- [ ] No interactive `div`/`span` without role + key handlers
- [ ] All controls have accessible names
- [ ] Inputs have labels
- [ ] Visible focus indicator preserved
- [ ] Incoming responses announced via live region
- [ ] State (loading/error) not conveyed by color alone
