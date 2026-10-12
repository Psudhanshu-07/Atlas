import { logger } from "../utils/logger";

const store = new Map<string, string>();

export function getCache(key: string): string | undefined {
  return store.get(key);
}

export function setCache(key: string, value: string): void {
  logger.debug("cache:set", key);
  store.set(key, value);
}
