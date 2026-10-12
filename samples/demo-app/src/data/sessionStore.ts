import { getCache } from "./cache";

export function getSession(id: string): string {
  return getCache("session:" + id) ?? "anon";
}
