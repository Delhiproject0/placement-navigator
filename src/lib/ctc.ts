/**
 * Parsing the free-text `offered_ctc` column into rupees.
 *
 * The column is student-entered prose and the live data is genuinely varied:
 *
 *   "INR 34,05,000"                    Indian lakh grouping
 *   " 18,00,000 INR "                  currency after, stray whitespace
 *   "11 LPA" / "INR 14.5 LPA"          lakhs per annum
 *   "15" / "13.5"                      bare, implicitly lakhs
 *   "INR 53,82,364, INR 44,73,930"     two figures in one field
 *   "-"                                a placeholder meaning "not disclosed"
 *
 * Sorting used to `parseFloat` the first digit run after stripping commas,
 * which read "11 LPA" as 11 and "INR 34,05,000" as 3405000 - putting them
 * six orders of magnitude apart in the same column.
 *
 * Everything is normalised to whole rupees so the values are comparable.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Below this, a bare figure has to mean lakhs: nobody is offered a
 * four-figure annual salary, and the live data uses "15" for 15 LPA.
 */
const BARE_NUMBER_IS_LAKHS_BELOW = 1000;

/** Every monetary figure in the string, in rupees, in the order written. */
export function parseCtcValues(raw: string | null | undefined): number[] {
  if (!raw) return [];

  const text = raw.toLowerCase().trim();
  if (!text || text === "-" || text === "--" || text === "n/a") return [];

  const values: number[] = [];

  // A number (with optional Indian or Western comma grouping and decimals),
  // plus whatever unit word immediately follows it.
  const pattern = /(\d[\d,]*(?:\.\d+)?)\s*(lpa|lakhs?|lacs?|l\b|crores?|cr\b)?/g;

  for (const match of text.matchAll(pattern)) {
    const digits = match[1].replace(/,/g, "");
    const amount = Number.parseFloat(digits);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const unit = match[2];
    if (unit) {
      values.push(Math.round(amount * (unit.startsWith("cr") || unit.startsWith("crore") ? CRORE : LAKH)));
    } else if (amount < BARE_NUMBER_IS_LAKHS_BELOW) {
      values.push(Math.round(amount * LAKH));
    } else {
      values.push(Math.round(amount));
    }
  }

  return values;
}

/**
 * The single figure to sort and compare by.
 *
 * Where a field lists two offers, the larger is the headline number - it is
 * the one a student is comparing against other companies.
 */
export function parseCtcToNumber(raw: string | null | undefined): number | null {
  const values = parseCtcValues(raw);
  return values.length ? Math.max(...values) : null;
}

/** The full range, for a field that lists more than one offer. */
export function parseCtcRange(raw: string | null | undefined): { min: number; max: number } | null {
  const values = parseCtcValues(raw);
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Compact Indian-convention display: "34.05 L", "1.10 Cr". */
export function formatCtc(rupees: number | null | undefined): string {
  if (rupees == null || !Number.isFinite(rupees)) return "--";
  if (rupees >= CRORE) {
    const crore = rupees / CRORE;
    return `${crore.toFixed(crore >= 10 ? 1 : 2)} Cr`;
  }
  const lakh = rupees / LAKH;
  return `${lakh.toFixed(lakh >= 10 ? 1 : 2)} L`;
}
