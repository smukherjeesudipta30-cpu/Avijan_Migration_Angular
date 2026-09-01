/**
 * Formats an amount in rupees for display.
 *
 * Whole amounts print without decimals — `₹13,812` rather than `₹13,812.00` —
 * because the ledgers are long and trailing zeros make them harder to scan.
 * Anything with paise prints them.
 *
 * That conditional matters more than it looks. Rounding to whole rupees turned a
 * teacher's ₹0.40 share of a ₹1 fee into **₹0**, which reads as "this teacher was
 * paid nothing" when the database held the right figure all along. A money column
 * may round for tidiness, but it must never render a non-zero amount as zero.
 */
export function formatMoney(value?: number | null): string {
  const amount = value ?? 0;

  // Compare against the rounded value rather than testing `% 1`, so floating
  // point noise on a whole number does not force decimals on every row.
  const hasPaise = Math.abs(amount - Math.round(amount)) > 0.0001;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0
  }).format(amount);
}
