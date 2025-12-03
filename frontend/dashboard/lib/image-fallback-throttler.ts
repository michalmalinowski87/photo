/**
 * Image Fallback Throttler - Prevents DDoS when many images fail simultaneously
 *
 * This throttler specifically handles image fallback requests to prevent:
 * - Overwhelming CloudFront/S3 with too many concurrent requests
 * - Triggering AWS rate limiting or DDoS protection
 * - Cascading failures when many images fail at once
 *
 * Features:
 * - Circuit breaker: Detects widespread failures and stops cascading
 * - Failure tracking: Monitors failure rate to detect systemic issues
 *
 * Note: Browser already limits concurrent image requests (typically 6-10 per domain),
 * so we focus on circuit breaking rather than rate limiting individual requests.
 */

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  openedAt: number | null;
  failureTimestamps: number[]; // Track failure timestamps for sliding window
}

class ImageFallbackThrottler {
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
    openedAt: null,
    failureTimestamps: [],
  };

  // Circuit breaker thresholds
  private readonly FAILURE_THRESHOLD = 20; // Open circuit after 20 failures
  private readonly FAILURE_WINDOW_MS = 10000; // Within 10 seconds (for 800+ images)
  private readonly CIRCUIT_RESET_MS = 60000; // Reset circuit after 60 seconds

  constructor() {
    // No options needed - browser handles rate limiting
  }

  /**
   * Record a failed request (for circuit breaker)
   */
  recordFailure(): void {
    const now = Date.now();

    // Add failure timestamp
    this.circuitBreaker.failureTimestamps.push(now);
    this.circuitBreaker.lastFailureTime = now;

    // Clean up old failures outside the window
    const cutoff = now - this.FAILURE_WINDOW_MS;
    this.circuitBreaker.failureTimestamps = this.circuitBreaker.failureTimestamps.filter(
      (timestamp) => timestamp > cutoff
    );

    // Update failure count
    this.circuitBreaker.failures = this.circuitBreaker.failureTimestamps.length;

    // Log when approaching threshold (at 50%, 75%, 90%)
    const thresholdPercent = (this.circuitBreaker.failures / this.FAILURE_THRESHOLD) * 100;
    if (
      thresholdPercent >= 50 &&
      thresholdPercent < 100 &&
      this.circuitBreaker.failures % 5 === 0
    ) {
      console.log("[ImageFallbackThrottler] ⚠️ Approaching circuit breaker threshold", {
        failures: this.circuitBreaker.failures,
        threshold: this.FAILURE_THRESHOLD,
        percent: Math.round(thresholdPercent),
        windowMs: this.FAILURE_WINDOW_MS,
        isOpen: this.circuitBreaker.isOpen,
      });
    }

    // Check if we should open the circuit
    if (this.circuitBreaker.failures >= this.FAILURE_THRESHOLD && !this.circuitBreaker.isOpen) {
      this.openCircuit();
    }
  }

  /**
   * Record a successful request (for circuit breaker)
   */
  recordSuccess(): void {
    // Gradually reduce failure count on success (don't reset immediately)
    // This prevents single success from resetting the circuit during widespread failures
    if (this.circuitBreaker.failures > 0) {
      this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 0.5);
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    if (!this.circuitBreaker.isOpen) {
      const now = Date.now();
      console.warn(
        "[ImageFallbackThrottler] 🔴 Opening circuit breaker - too many failures detected",
        {
          failures: this.circuitBreaker.failures,
          threshold: this.FAILURE_THRESHOLD,
          windowMs: this.FAILURE_WINDOW_MS,
          resetAfterMs: this.CIRCUIT_RESET_MS,
          timestamp: new Date(now).toISOString(),
          failureTimestamps: this.circuitBreaker.failureTimestamps.map((ts) =>
            new Date(ts).toISOString()
          ),
        }
      );
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.openedAt = now;
    }
  }

  /**
   * Reset the circuit breaker
   */
  private resetCircuit(): void {
    const wasOpen = this.circuitBreaker.isOpen;
    const wasOpenFor = this.circuitBreaker.openedAt ? Date.now() - this.circuitBreaker.openedAt : 0;

    console.log("[ImageFallbackThrottler] 🟢 Resetting circuit breaker", {
      wasOpen,
      wasOpenForMs: wasOpenFor,
      failures: this.circuitBreaker.failures,
      timestamp: new Date().toISOString(),
    });

    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      isOpen: false,
      openedAt: null,
      failureTimestamps: [],
    };
  }

  /**
   * Check if circuit breaker is open (public method for components)
   */
  isCircuitOpen(): boolean {
    return this.isCircuitOpenInternal();
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): { isOpen: boolean; failures: number } {
    return {
      isOpen: this.circuitBreaker.isOpen,
      failures: this.circuitBreaker.failures,
    };
  }

  /**
   * Internal method to check circuit breaker
   */
  private isCircuitOpenInternal(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    // Check if we should reset the circuit
    if (this.circuitBreaker.openedAt) {
      const timeSinceOpen = Date.now() - this.circuitBreaker.openedAt;
      if (timeSinceOpen >= this.CIRCUIT_RESET_MS) {
        this.resetCircuit();
        return false;
      }

      // Log circuit breaker status periodically (every 5 seconds)
      const logInterval = 5000;
      const timeSinceLastLog = timeSinceOpen % logInterval;
      if (timeSinceLastLog < 100) {
        // Log within 100ms of interval
        console.log("[ImageFallbackThrottler] Circuit breaker is OPEN", {
          timeSinceOpenMs: timeSinceOpen,
          resetAfterMs: this.CIRCUIT_RESET_MS,
          remainingMs: this.CIRCUIT_RESET_MS - timeSinceOpen,
          failures: this.circuitBreaker.failures,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return true;
  }
}

// Export singleton instance for global use
export const imageFallbackThrottler = new ImageFallbackThrottler();

// Also export the class for custom instances
export { ImageFallbackThrottler };
