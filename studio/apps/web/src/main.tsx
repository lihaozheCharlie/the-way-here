import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-sc";
import App from "./App";
import { currentLocale } from "./shared/i18n";
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

if (currentLocale() === "en") document.title = "The Way Here";

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

import "./shared/document.css";
import "./styles/source-navigation.css";
