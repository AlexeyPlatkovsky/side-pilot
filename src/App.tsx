import { useEffect } from "react";
import { Bubble } from "./components/Bubble";
import { tauriChatApi } from "./chat/api";
import { applyTheme, isValidTheme } from "./theme";

export default function App() {
  useEffect(() => {
    tauriChatApi
      .getGeneralPreferences()
      .then((prefs) => {
        if (isValidTheme(prefs.theme)) applyTheme(prefs.theme);
      })
      .catch(() => {});
  }, []);

  return <Bubble chatApi={tauriChatApi} />;
}
