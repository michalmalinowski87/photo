/**
 * Formats bytes into a human-readable string (KB, MB, GB)
 * @param bytes - The number of bytes to format
 * @returns Formatted string (e.g., "2.56 MB", "1.00 GB")
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) {
    return "0.00 MB";
  }
  if (bytes < 1024 * 1024) {
    // Less than 1 MB, show in KB
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    // Less than 1 GB, show in MB
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

