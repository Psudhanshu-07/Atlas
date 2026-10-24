import { fetchFxRate } from "../utils/api-client";
import { slugify } from "../utils/strings";
import { logger } from "../utils/logger";

export function priceCart(skus: string[]): number {
  const rate = fetchFxRate("USD");
  const key = slugify(skus.join(" "));
  logger.debug("pricing", key, rate);
  return skus.length * 1000 * rate;
}
