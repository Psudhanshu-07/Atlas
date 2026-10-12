import { logger } from "../utils/logger";

const tables = new Map<string, unknown[]>();

export function query(sql: string, params: unknown[] = []): unknown[] {
  logger.debug("sql", sql, params);
  return tables.get(sql) ?? [];
}

export function nextId(prefix: string): string {
  return prefix + "-" + (tables.size + 1);
}
