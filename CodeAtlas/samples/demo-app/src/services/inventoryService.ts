import { query } from "../data/db";
import { getOrder } from "./orderService"; // circular dependency partner
import { logger } from "../utils/logger";

export function reserveStock(qty: number) {
  logger.debug("reserveStock", qty);
  return query("update stock set qty = qty - ?", [qty]);
}

export function restockFromOrder(orderId: string) {
  const order = getOrder(orderId); // closes the cycle with orderService
  return reserveStock(order ? 1 : 0);
}
