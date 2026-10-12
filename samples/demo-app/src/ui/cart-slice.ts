import type { Order } from "../data/order-types"; // the view layer pulls types straight from persistence

export type Cart = Order[];

export function cartTotal(cart: Cart): number {
  return cart.reduce((sum, line) => sum + line.total, 0);
}
