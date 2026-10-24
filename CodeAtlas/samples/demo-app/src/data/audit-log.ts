import { showToast } from "../ui/toast"; // layering violation: persistence drives the UI
import { logger } from "../utils/logger";

export function recordAudit(action: string, target: string): void {
  logger.info("audit", action, target);
  showToast("Audit: " + action);
}
