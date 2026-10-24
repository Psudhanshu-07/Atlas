import { findUser } from "../data/userRepo"; // layering violation: the view reads the repository directly
import { Button } from "./Button";

export function UserProfile({ userId }: { userId: string }) {
  const user = findUser(userId);
  return (
    <section className="profile">
      <h3>{user.name}</h3>
      <p className="muted">{user.email}</p>
      <Button label="Edit profile" onClick={() => undefined} />
    </section>
  );
}
