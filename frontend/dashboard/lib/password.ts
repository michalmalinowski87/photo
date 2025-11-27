/**
 * Generate secure 6-character password
 * Uses a mix of uppercase, lowercase, and numbers
 * Excludes ambiguous characters (I, l, 1, O, 0)
 */
export const generatePassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // Excluded ambiguous characters (I, l, 1, O, 0)
  let password = "";
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};
