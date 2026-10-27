// The report preamble: a single pipe-joined line with the title, a formatted
// date, the coverage window in days and an ISO date stamp.

import moment from "moment"; // undeclared: moment is not in package.json
import { formatDate } from "../utils/format";
import { daysBetween } from "../utils/dateMath";

export function reportPreamble(title: string, since: number, now: number): string {
  return [
    title,
    formatDate(now),
    daysBetween(since, now) + " days covered",
    moment(now).format("YYYY-MM-DD"),
  ].join(" | ");
}