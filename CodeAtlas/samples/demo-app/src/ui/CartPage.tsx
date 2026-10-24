import { useState } from "react";
import { currentCart } from "../services/cartService";
import { formatMoney } from "../utils/format";
import { Button } from "./Button";
import { cartTotal } from "./cart-slice";

export function CartPage() {
  const [open, setOpen] = useState(true);
  const total = cartTotal(currentCart());
  if (!open) return null;
  return (
    <section className="cart">
      <h2>Cart</h2>
      <strong>{formatMoney(total)}</strong>
      <Button label="Checkout" onClick={() => setOpen(false)} />
    </section>
  );
}
