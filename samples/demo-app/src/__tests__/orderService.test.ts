import { getOrder, listOrders } from "../services/orderService";

describe("orderService", () => {
  it("reads an order", () => {
    expect(getOrder("demo-1").id).toBe("demo-1");
  });

  it("lists orders", () => {
    expect(listOrders("open").length).toBeGreaterThan(0);
  });
});
