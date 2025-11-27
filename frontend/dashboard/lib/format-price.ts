/**
 * Centralized price formatting utility
 * Converts cents to PLN format for display
 */

/**
 * Formats cents to PLN string for display
 * Always shows 2 decimal places and includes "PLN" suffix
 *
 * @param cents - Amount in cents (grosze)
 * @returns Formatted string like "12.34 PLN"
 */
export function formatPrice(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || isNaN(cents)) {
    return "0.00 PLN";
  }
  return `${(cents / 100).toFixed(2)} PLN`;
}

/**
 * Formats cents to PLN number (without currency symbol)
 * Useful for calculations or when you need just the number
 *
 * @param cents - Amount in cents (grosze)
 * @returns Number in PLN (e.g., 12.34)
 */
export function centsToPln(cents: number | undefined | null): number {
  if (cents === undefined || cents === null || isNaN(cents)) {
    return 0;
  }
  return cents / 100;
}

/**
 * Formats cents to PLN string without "PLN" suffix
 * Useful when you want to add the currency symbol separately
 *
 * @param cents - Amount in cents (grosze)
 * @returns Formatted string like "12.34"
 */
export function formatPriceNumber(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || isNaN(cents)) {
    return "0.00";
  }
  return (cents / 100).toFixed(2);
}
