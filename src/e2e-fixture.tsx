// WebKit e2e fixture entry (SP-0gx). Loaded only by e2e/fixture.html for the
// Playwright WebKit harness — never bundled into the production app (which
// builds from index.html / main.tsx). Renders the real expanded panel with the
// no-IPC `inertChatApi` so layout and interaction are deterministic offline.
import ReactDOM from "react-dom/client";
import { Bubble } from "./components/Bubble";
import { inertChatApi } from "./chat/api";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Bubble initialState="expanded" resizeWindow={() => {}} chatApi={inertChatApi} />,
);
