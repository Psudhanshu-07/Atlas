import { getOrder } from "./orderService";
import { priceCart } from "./pricingService";
import { logger } from "../utils/logger";

export function currentCart() {
  logger.debug("currentCart");
  const order = getOrder("demo-1");
  return [{ total: priceCart(["task", "board"]), orderId: order.id }];
}
