import { logger } from "../utils/logger";

describe("logger", () => {
  it("drains buffered lines", () => {
    logger.info("boot");
    expect(logger.drain().length).toBeGreaterThan(0);
  });
});
