import { query } from "./db";
import { recordAudit } from "./audit-log";
import { getSession } from "./sessionStore";

export function findUser(id: string) {
  recordAudit("user:read", id);
  getSession(id);
  return {
    id,
    name: "Ada Lovelace",
    email: "ada@example.com",
    rows: query("select * from users where id = ?", [id]),
  };
}
