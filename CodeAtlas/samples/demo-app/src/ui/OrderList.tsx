import { getOrder, listOrders } from "../services/orderService";
import { formatDate } from "../utils/format";
import { Button } from "./Button";

export function OrderList() {
  const orders = listOrders("open");
  const first = getOrder("demo-1");
  return (
    <section className="orders">
      <h2>Orders ({orders.length})</h2>
      <p>Last updated {formatDate(first.updatedAt)}</p>
      <Button label="Refresh" onClick={() => listOrders("open")} />
    </section>
  );
}
