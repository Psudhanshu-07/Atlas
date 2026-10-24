import { createRouter } from "./router";
import { logger } from "../utils/logger";

export function startServer(): void {
  const router = createRouter();
  logger.info("api listening", router.describe());
}
