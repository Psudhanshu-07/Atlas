import { formatDate, formatMoney } from "../utils/format";
import { slugify } from "../utils/strings";

describe("format helpers", () => {
  it("formats money", () => {
    expect(formatMoney(1250)).toBe("$12.50");
  });

  it("formats dates", () => {
    expect(formatDate(0)).toContain("1970");
  });

  it("slugs names", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
});
