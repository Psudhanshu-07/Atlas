import { handleExport } from "../api/exportController"; // upward dependency + half of the cycle
import { buildReport } from "./reportService";
import { logger } from "../utils/logger";

export function exportOrders(format: string) {
  logger.debug("exportOrders", format);
  const report = buildReport("orders");
  const route = handleExport(); // the controller already calls this service
  return { format, report, route };
}
