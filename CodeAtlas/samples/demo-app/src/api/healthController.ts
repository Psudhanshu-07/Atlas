import { logger } from "../utils/logger";

export function handleHealth() {
  logger.debug("health check");
  return { ok: true, uptime: process.uptime() };
}
