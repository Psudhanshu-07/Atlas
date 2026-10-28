import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import "./styles/ui.css";
import "./styles/views.css";
import "./styles/analysis.css";

const el = document.getElementById("root");
if (el) createRoot(el).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);