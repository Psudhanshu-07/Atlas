import { logger } from "../utils/logger";

export function Header() {
  logger.debug("header rendered");
  return (
    <header className="app-header">
      <h1>TaskFlow</h1>
      <span className="muted">workspace: product</span>
    </header>
  );
}
