import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { sizeFor, type BubbleState } from "./bubbleState";

/**
 * Apply the OS-window size that matches the bubble state. This is the only
 * Tauri-runtime dependency of the bubble; components accept it as an injectable
 * prop so they stay unit-testable without a live window.
 */
/* v8 ignore next 3 */
export async function applyWindowSize(state: BubbleState): Promise<void> {
  const { width, height } = sizeFor(state);
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}
