/**
 * Money helpers — Rule #3.
 * All monetary values are stored and computed as integers in paise.
 * Never use float for money.
 */

/** Format paise as a localised INR string: 150000 → "₹1,500.00" */
export function formatPaise(paise: number, currency = "INR"): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(rupees);
}

/** Convert a rupee string/number from user input to integer paise.
 *  Rounds to nearest paisa. Throws if input is not a valid finite number. */
export function rupeesToPaise(rupees: number | string): number {
  const r = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  if (!isFinite(r) || isNaN(r)) throw new Error(`Invalid rupee amount: ${rupees}`);
  return Math.round(r * 100);
}

/** Compute invoice totals server-side from line items + tax + discount.
 *  Returns integer paise values only. */
export function computeInvoiceTotals(
  items: { quantity: number; unitPricePaise: number }[],
  taxPercent: number,  // e.g. 18 for 18%
  discountPaise: number
): {
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  totalPaise: number;
} {
  const subtotalPaise = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPricePaise,
    0
  );
  // Tax is applied after discount
  const afterDiscount = Math.max(0, subtotalPaise - discountPaise);
  const taxPaise = Math.round(afterDiscount * (taxPercent / 100));
  const totalPaise = afterDiscount + taxPaise;
  return { subtotalPaise, taxPaise, discountPaise, totalPaise };
}
