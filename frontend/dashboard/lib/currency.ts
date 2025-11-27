/**
 * Currency input formatting and validation utilities
 * Enforces proper decimal format for PLN currency inputs
 */

/**
 * Formats a currency input string to enforce proper decimal format
 * - Allows only digits and one decimal point
 * - Limits to 2 decimal places
 * - Removes invalid characters
 */
export function formatCurrencyInput(value: string): string {
  if (!value || value === "") {
    return "";
  }

  // Remove any non-digit characters except decimal point
  let cleaned = value.replace(/[^\d.]/g, "");

  // Split by decimal point to check
  const parts = cleaned.split(".");

  // Ensure only one decimal point
  if (parts.length > 2) {
    cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
  }

  // Re-split after potential modification
  const finalParts = cleaned.split(".");

  // Limit to 2 decimal places if decimal point exists
  if (finalParts.length === 2 && finalParts[1].length > 2) {
    cleaned = `${finalParts[0]}.${finalParts[1].substring(0, 2)}`;
  }

  return cleaned;
}

/**
 * Converts PLN string to cents (grosze)
 * Handles empty strings and invalid values gracefully
 */
export function plnToCents(plnString: string): number {
  if (!plnString || plnString === "") {
    return 0;
  }
  const value = parseFloat(plnString);
  return isNaN(value) ? 0 : Math.round(value * 100);
}

/**
 * Converts cents (grosze) to PLN string for display
 * Returns empty string for zero values
 */
export function centsToPlnString(cents: number): string {
  if (cents === 0) {
    return "";
  }
  const value = cents / 100;
  // Format to 2 decimal places, but remove trailing zeros if not needed
  const formatted = value.toFixed(2);
  // Remove trailing zeros and decimal point if not needed
  return formatted.replace(/\.?0+$/, "") || "0";
}

/**
 * Validates currency input value
 * Checks if the value is a valid positive number
 */
export function isValidCurrency(value: string): boolean {
  if (!value || value === "") {
    return true;
  } // Empty is valid (will be treated as 0)
  const numValue = parseFloat(value);
  return !isNaN(numValue) && numValue >= 0;
}
