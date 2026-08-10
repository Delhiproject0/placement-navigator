import { describe, expect, it } from "vitest";
import { formatCtc, parseCtcRange, parseCtcToNumber, parseCtcValues } from "@/lib/ctc";

/**
 * Every string here is a real value taken from the live `offered_ctc` column.
 * The parser exists because these are what students actually type.
 */
describe("parseCtcToNumber - real values from production", () => {
  const cases: Array<[string, number]> = [
    ["INR 34,05,000", 3_405_000],
    ["INR 1,10,00,000", 11_000_000],
    [" 18,00,000 INR", 1_800_000],
    ["18,00,000 INR ", 1_800_000],
    ["10,00,000", 1_000_000],
    ["16,57,000", 1_657_000],
    ["INR 83,28,117", 8_328_117],
    // Lakh suffixes
    ["11 LPA", 1_100_000],
    ["14.5 LPA", 1_450_000],
    ["INR 14.5 LPA", 1_450_000],
    ["20 LPA", 2_000_000],
    // Bare numbers are lakhs - "15" next to "15 LPA" in the same column
    ["15", 1_500_000],
    ["13.5", 1_350_000],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      expect(parseCtcToNumber(input)).toBe(expected);
    });
  }

  it("takes the larger of two offers listed in one field", () => {
    expect(parseCtcToNumber("INR 53,82,364, INR 44,73,930")).toBe(5_382_364);
    expect(parseCtcToNumber("INR 33,39,787, INR 42,34,625")).toBe(4_234_625);
  });

  it("treats placeholders and blanks as absent, not as zero", () => {
    // Sorting used to rank these as the cheapest offers rather than unknown.
    for (const empty of ["-", "", "  ", null, undefined, "N/A"]) {
      expect(parseCtcToNumber(empty)).toBeNull();
    }
  });

  it("keeps lakh and rupee figures on the same scale", () => {
    // The bug this file exists to prevent: "11 LPA" must not sort below
    // "INR 17,00,000" just because 11 < 1700000 as raw digits.
    expect(parseCtcToNumber("11 LPA")).toBeLessThan(parseCtcToNumber("INR 17,00,000")!);
    expect(parseCtcToNumber("20 LPA")).toBeGreaterThan(parseCtcToNumber("INR 17,00,000")!);
  });
});

describe("parseCtcValues / parseCtcRange", () => {
  it("returns every figure in written order", () => {
    expect(parseCtcValues("INR 53,82,364, INR 44,73,930")).toEqual([5_382_364, 4_473_930]);
  });

  it("reports the range across multiple offers", () => {
    expect(parseCtcRange("INR 53,82,364, INR 44,73,930")).toEqual({
      min: 4_473_930,
      max: 5_382_364,
    });
  });

  it("understands crore", () => {
    expect(parseCtcValues("1.1 Cr")).toEqual([11_000_000]);
    expect(parseCtcValues("2 crore")).toEqual([20_000_000]);
  });

  it("returns an empty list rather than [0] for junk", () => {
    expect(parseCtcValues("not disclosed")).toEqual([]);
    expect(parseCtcValues("0")).toEqual([]);
  });
});

describe("formatCtc", () => {
  it("uses Indian conventions", () => {
    // One decimal above 10 L, two below, so the magnitude stays readable at
    // both ends. 34.05 renders as "34.0" because the binary representation of
    // 34.05 sits just under the rounding midpoint - accepted, since the
    // compact form is not meant to be exact to the rupee.
    expect(formatCtc(3_405_000)).toBe("34.0 L");
    expect(formatCtc(1_100_000)).toBe("11.0 L");
    expect(formatCtc(950_000)).toBe("9.50 L");
    expect(formatCtc(11_000_000)).toBe("1.10 Cr");
  });

  it("renders absent values as a dash", () => {
    expect(formatCtc(null)).toBe("--");
    expect(formatCtc(undefined)).toBe("--");
    expect(formatCtc(Number.NaN)).toBe("--");
  });
});
