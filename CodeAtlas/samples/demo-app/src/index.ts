import { createRoot } from "react-dom/client";
import { AppShell } from "./ui/AppShell";
import { startServer } from "./api/server";

export function bootstrap(): void {
  const el = document.getElementById("root");
  if (el) createRoot(el).render(AppShell());
  startServer();
}

bootstrap();
