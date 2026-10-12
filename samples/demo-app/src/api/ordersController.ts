import { z } from "zod"; // undeclared: zod is not in package.json
import { getOrder, listOrders } from "../services/orderService";
import { logger } from "../utils/logger";

const OrderQuery = z.object({
  status: z.string().optional(),
});

export function handleOrders() {
  const query = OrderQuery.parse({ status: "open" });
  logger.debug("orders query", query.status);
  return {
    open: listOrders(query.status ?? "open"),
    first: getOrder("demo-1"),
  };
}
