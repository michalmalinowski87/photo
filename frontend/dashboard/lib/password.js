/**
 * Generate secure 6-character password
 * Uses a mix of uppercase, lowercase, and numbers
 * Excludes ambiguous characters (I, l, 1, O, 0)
 * @returns {string} A 6-character password
 */
export const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // Excluded ambiguous characters (I, l, 1, O, 0)
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

