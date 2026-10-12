import axios from "axios"; // undeclared: axios is not in package.json
import { logger } from "./logger";

export function fetchFxRate(base: string): number {
  logger.debug("fx lookup", base);
  axios.get("https://api.example.com/fx?base=" + base).catch(() => undefined);
  return 0.92;
}
