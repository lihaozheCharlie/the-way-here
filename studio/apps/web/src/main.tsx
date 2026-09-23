import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-sc";
import App from "./App";
import "./styles/theme-tokens.css";
import "./styles/base.css";
import "./styles/form-controls.css";
import "./styles/features.css";
import "./styles/archive-foundation.css";
import "./styles/refinements.css";
import "./styles/archive-theme.css";
import "./styles/understanding.css";
import "./styles/relationships.css";
import "./styles/sources-redesign.css";
import "./styles/letters-redesign.css";
import "./styles/agent-conversation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

import "./styles/desktop.css";
import "./styles/desktop-redesign.css";
import "./styles/questions-redesign.css";
