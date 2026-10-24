import moment from "moment"; // undeclared: moment is not in package.json
import { query } from "../data/db";
import { formatDate } from "../utils/format";
import { slugify } from "../utils/strings";
import { daysBetween, WEEK_MS } from "../utils/dateMath";
import { logger } from "../utils/logger";
import type { Order } from "../data/order-types";

export interface ReportOptions {
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
  const preamble = [
    options.title,
    formatDate(now),
    daysBetween(options.since ?? now, now) + " days covered",
    moment(now).format("YYYY-MM-DD"),
  ].join(" | ");
  const body = [section1(orders), section2(orders), section3(orders), section4(orders), section5(orders)];
  return [preamble, ...body].join("\n\n");
}

// ---------------------------------------------------------------- sections

function section1(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 1 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section2(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 2 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section3(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 3 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section4(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 4
  const rows = orders.slice(0, 5);
  const heading = "Section 4 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section5(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 5 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section6(orders: unknown[]): string {
  const rows = orders.slice(0, 1);
  const heading = "Section 6 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section7(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 7
  const rows = orders.slice(0, 2);
  const heading = "Section 7 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section8(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 8
  const rows = orders.slice(0, 3);
  const heading = "Section 8 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section9(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 9 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section10(orders: unknown[]): string {
  const rows = orders.slice(0, 5);
  const heading = "Section 10 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section11(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 11 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section12(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 12
  const rows = orders.slice(0, 1);
  const heading = "Section 12 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section13(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 13 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section14(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 14
  const rows = orders.slice(0, 3);
  const heading = "Section 14 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section15(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 15 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section16(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 16
  const rows = orders.slice(0, 5);
  const heading = "Section 16 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section17(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 17 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section18(orders: unknown[]): string {
  const rows = orders.slice(0, 1);
  const heading = "Section 18 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section19(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 19 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section20(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 20
  const rows = orders.slice(0, 3);
  const heading = "Section 20 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section21(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 21
  const rows = orders.slice(0, 4);
  const heading = "Section 21 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section22(orders: unknown[]): string {
  const rows = orders.slice(0, 5);
  const heading = "Section 22 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section23(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 23 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section24(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 24
  const rows = orders.slice(0, 1);
  const heading = "Section 24 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section25(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 25 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section26(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 26 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section27(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 27 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section28(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 28
  // FIXME: pagination is hard-coded for section 28
  const rows = orders.slice(0, 5);
  const heading = "Section 28 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section29(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 29 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section30(orders: unknown[]): string {
  const rows = orders.slice(0, 1);
  const heading = "Section 30 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section31(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 31 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section32(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 32
  const rows = orders.slice(0, 3);
  const heading = "Section 32 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section33(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 33 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section34(orders: unknown[]): string {
  const rows = orders.slice(0, 5);
  const heading = "Section 34 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section35(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 35
  const rows = orders.slice(0, 6);
  const heading = "Section 35 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section36(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 36
  const rows = orders.slice(0, 1);
  const heading = "Section 36 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section37(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 37 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section38(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 38 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section39(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 39 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section40(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 40
  const rows = orders.slice(0, 5);
  const heading = "Section 40 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section41(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 41 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section42(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 42
  const rows = orders.slice(0, 1);
  const heading = "Section 42 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section43(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 43 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section44(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 44
  const rows = orders.slice(0, 3);
  const heading = "Section 44 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section45(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 45 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section46(orders: unknown[]): string {
  const rows = orders.slice(0, 5);
  const heading = "Section 46 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section47(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 47 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section48(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 48
  const rows = orders.slice(0, 1);
  const heading = "Section 48 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section49(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 49
  const rows = orders.slice(0, 2);
  const heading = "Section 49 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section50(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 50 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section51(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 51 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section52(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 52
  const rows = orders.slice(0, 5);
  const heading = "Section 52 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section53(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 53 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section54(orders: unknown[]): string {
  const rows = orders.slice(0, 1);
  const heading = "Section 54 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section55(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 55 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section56(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 56
  // FIXME: pagination is hard-coded for section 56
  const rows = orders.slice(0, 3);
  const heading = "Section 56 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section57(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 57 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section58(orders: unknown[]): string {
  const rows = orders.slice(0, 5);
  const heading = "Section 58 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section59(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 59 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section60(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 60
  const rows = orders.slice(0, 1);
  const heading = "Section 60 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section61(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 61 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section62(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 62 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section63(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 63
  const rows = orders.slice(0, 4);
  const heading = "Section 63 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section64(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 64
  const rows = orders.slice(0, 5);
  const heading = "Section 64 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section65(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 65 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section66(orders: unknown[]): string {
  const rows = orders.slice(0, 1);
  const heading = "Section 66 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section67(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 67 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section68(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 68
  const rows = orders.slice(0, 3);
  const heading = "Section 68 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section69(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 69 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section70(orders: unknown[]): string {
  // FIXME: pagination is hard-coded for section 70
  const rows = orders.slice(0, 5);
  const heading = "Section 70 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section71(orders: unknown[]): string {
  const rows = orders.slice(0, 6);
  const heading = "Section 71 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section72(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 72
  const rows = orders.slice(0, 1);
  const heading = "Section 72 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section73(orders: unknown[]): string {
  const rows = orders.slice(0, 2);
  const heading = "Section 73 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section74(orders: unknown[]): string {
  const rows = orders.slice(0, 3);
  const heading = "Section 74 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section75(orders: unknown[]): string {
  const rows = orders.slice(0, 4);
  const heading = "Section 75 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}

function section76(orders: unknown[]): string {
  // TODO: extract the shared column formatter used by section 76
  const rows = orders.slice(0, 5);
  const heading = "Section 76 of the order report";
  const flags = rows.filter((row) => String(row).length > 0);
  const body = flags.map((row, idx) => heading + " #" + idx + " " + slugify(String(row))).join("\n");
  if (rows.length === 0) {
    return heading + ": empty";
  }
  return body;
}
