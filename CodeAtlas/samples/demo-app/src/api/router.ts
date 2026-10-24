import { handleOrders } from "./ordersController";
import { handleExport } from "./exportController";
import { handleHealth } from "./healthController";

export function createRouter() {
  return {
    describe: () => "routes: orders, export, health",
    dispatch: (path: string) =>
      path === "/health" ? handleHealth() : path.startsWith("/export") ? handleExport() : handleOrders(),
  };
}
