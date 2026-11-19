/**
 * Money arrives from the API as whole units of Rs 100,000 (one lakh). It is shown in
 * Pakistani rupees, in millions: 220 -> "Rs 22M", 25 -> "Rs 2.5M".
 */
export const UNITS_PER_MILLION = 10;

/** "22M", "2.5M" (no currency prefix), or "—" when there is no amount. */
export function fmtM(units: number | null | undefined): string {
  if (units == null) return "—";
  return `${Number((units / UNITS_PER_MILLION).toFixed(1)).toLocaleString("en-US")}M`;
}

/** "Rs 22M". */
export function pkr(units: number | null | undefined): string {
  return units == null ? "—" : `Rs ${fmtM(units)}`;
}

/** Millions typed in a form (e.g. 2.5) -> API units (25). */
export const fromMillions = (m: number) => Math.round(m * UNITS_PER_MILLION);
/** API units (25) -> millions for a form field (2.5). */
export const toMillions = (units: number) => units / UNITS_PER_MILLION;
