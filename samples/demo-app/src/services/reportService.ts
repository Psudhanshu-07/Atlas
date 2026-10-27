// Weekly order report service. Formatting lives in ./reportSections and
// ./reportPreamble; this module orchestrates query → assembly.

import { query } from "../data/db";
import { reportPreamble } from "./reportPreamble";
import { reportSections } from "./reportSections";
import { slugify } from "../utils/strings";
import { WEEK_MS } from "../utils/dateMath";
import { logger } from "../utils/logger";
import type { Order } from "../data/order-types";

interface ReportOptions {
  title: string;
  format: "csv" | "pdf";
  since?: number;
}

export function buildReport(kind: string): string {
  logger.debug("buildReport", kind);
  const orders = query("select * from orders") as Order[];
  const now = Date.now();
  const options: ReportOptions = {
    title: slugify(kind) + " report",
    format: "csv",
    since: now - WEEK_MS,
  };
  const preamble = reportPreamble(options.title, options.since ?? now, now);
  const body = reportSections(orders);
  return [preamble, ...body].join("\n\n");
}
