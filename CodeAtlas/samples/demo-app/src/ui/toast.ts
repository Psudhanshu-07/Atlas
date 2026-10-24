import { logger } from "../utils/logger";

export function showToast(message: string): void {
  logger.info("toast", message);
}
