import { Header } from "./Header";
import { OrderList } from "./OrderList";
import { CartPage } from "./CartPage";
import { UserProfile } from "./UserProfile";
import { showToast } from "./toast";

export function AppShell() {
  return (
    <div className="shell">
      <Header />
      <main>
        <OrderList />
        <CartPage />
        <UserProfile userId="u-1" />
      </main>
      <button onClick={() => showToast("Welcome back")}>Help</button>
    </div>
  );
}
