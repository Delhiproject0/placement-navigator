import { createRoot } from "react-dom/client";

// Self-hosted variable fonts. Importing the variable-weight files means one
// request per family instead of one per weight, and no third-party CDN.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
