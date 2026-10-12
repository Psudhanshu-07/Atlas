import { exportOrders } from "../services/exportService";
import { logger } from "../utils/logger";

export function handleExport() {
  logger.debug("export started");
  return exportOrders("csv");
}
