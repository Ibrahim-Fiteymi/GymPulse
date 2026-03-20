/**
 * main.jsx — Entry point for the GymPulse React application.
 *
 * This file bootstraps the React application by rendering the root App
 * component into the DOM element with id="root" (defined in index.html).
 *
 * StrictMode enables additional development-only checks and warnings.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
