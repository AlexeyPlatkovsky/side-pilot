import { Bubble } from "./components/Bubble";
import { tauriChatApi } from "./chat/api";

export default function App() {
  // Wire the floating bubble to the real Tauri chat backend (run_adapter +
  // SQLite history). Tests render <Bubble /> with an injected api instead.
  return <Bubble chatApi={tauriChatApi} />;
}
