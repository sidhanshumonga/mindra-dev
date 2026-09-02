import React from "react";
import { createRoot } from "react-dom/client";
import { AdaptiveProvider } from "@mindra.dev/react";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/*
      lambda is lowered from its default of 8 so the curve is visible within a
      handful of clicks. In a real product you want the slower default.
    */}
    <AdaptiveProvider appId="mindra-example" lambda={3}>
      <App />
    </AdaptiveProvider>
  </React.StrictMode>
);
