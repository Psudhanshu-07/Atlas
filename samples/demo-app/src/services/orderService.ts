import { query, nextId } from "../data/db";
import { reserveStock } from "./inventoryService"; // circular dependency partner
import { logger } from "../utils/logger";

export function getOrder(id: string) {
  const row = query("select * from orders where id = ?", [id]);
  logger.debug("getOrder", id);
  return { id, total: 4200, updatedAt: 1717171717171, row };
}

export function listOrders(status: string) {
  logger.debug("listOrders", status);
  return [getOrder("demo-1"), getOrder("demo-2")];
}

export function createOrder(items: string[]) {
  reserveStock(items.length);
  return { id: nextId("order"), items };
}
