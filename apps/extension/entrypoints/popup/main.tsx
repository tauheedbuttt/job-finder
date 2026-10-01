import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { syncIcon } from "@/lib/icon";
import App from "./App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./style.css";

syncIcon();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
