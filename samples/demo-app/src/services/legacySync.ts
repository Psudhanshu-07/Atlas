import { query } from "../data/db";
import { logger } from "../utils/logger";

export interface SyncResult {
  synced: number;
  failed: number;
}

export function legacySync(batchSize: number): SyncResult {
  logger.debug("legacySync start", batchSize);
  const rows = query("select * from staging limit ?", [batchSize]);
  let synced = 0;
  let failed = 0;
  for (const row of rows as unknown[]) {
    const id = (row as { id: string }).id;
    try {
      query("insert into orders select * from staging where id = ?", [id]);
      synced += 1;
    } catch (err) {
      logger.error("legacySync failed", err);
      failed += 1;
    }
  }
  return { synced, failed };
}

export function legacySyncStatus(): string {
  const result = legacySync(500);
  return result.failed === 0 ? "clean" : "degraded";
}
