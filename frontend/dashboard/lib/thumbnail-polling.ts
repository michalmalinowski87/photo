/**
 * Utility for polling CloudFront thumbnail availability
 * Used to determine when backend processing (thumbnails, previews) is complete
 */

/**
 * Poll a URL to check if it's available (returns 200)
 * Uses HEAD request to minimize bandwidth
 * 
 * @param url - The URL to poll (CloudFront thumbnail URL)
 * @param maxAttempts - Maximum number of polling attempts (default: 10)
 * @param intervalMs - Interval between attempts in milliseconds (default: 500)
 * @returns Promise that resolves to true if URL is available, false if timeout
 */
export async function pollThumbnailAvailability(
  url: string,
  maxAttempts: number = 10,
  intervalMs: number = 500
): Promise<boolean> {
  if (!url) {
    return false;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        mode: "cors",
        cache: "no-cache",
      });

      // If we get a 200, the thumbnail is available
      if (response.ok) {
        return true;
      }

      // If we get 403, it might be a CORS issue but the file exists
      // CloudFront might return 403 for HEAD requests even if GET works
      // So we'll treat 403 as "might be available" and continue polling
      // If it's 404, the file definitely doesn't exist yet
      if (response.status === 404) {
        // File doesn't exist yet, wait and try again
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        continue;
      }

      // For other status codes (403, 500, etc.), assume it might be available
      // CloudFront can return 403 for HEAD requests even when GET works
      // So we'll be optimistic and return true
      if (response.status === 403) {
        // Likely a CORS issue with HEAD request, but file might exist
        // Try a GET request to verify
        try {
          const getResponse = await fetch(url, {
            method: "GET",
            mode: "cors",
            cache: "no-cache",
            // Only fetch headers, not the full image
            headers: { Range: "bytes=0-0" },
          });
          if (getResponse.ok || getResponse.status === 206) {
            return true;
          }
        } catch {
          // GET also failed, continue polling
        }
      }

      // Wait before next attempt (except on last attempt)
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    } catch (error) {
      // Network error or CORS issue - wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  // Max attempts reached, thumbnail not available yet
  return false;
}

