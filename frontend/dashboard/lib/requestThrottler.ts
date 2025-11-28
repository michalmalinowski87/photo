/**
 * Request Throttler - Prevents overwhelming API Gateway with too many concurrent requests
 *
 * This utility queues API requests and processes them with rate limiting to avoid
 * triggering AWS DDoS protection or rate limiting.
 */

interface QueuedRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  requestFn: () => Promise<T>;
  timestamp: number;
}

class RequestThrottler {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private requestsPerSecond: number;
  private minDelayMs: number;
  private lastRequestTime = 0;

  constructor(options: { requestsPerSecond?: number; minDelayMs?: number } = {}) {
    // Default: max 10 requests per second (100ms between requests)
    // This prevents overwhelming API Gateway while still allowing reasonable throughput
    this.requestsPerSecond = options.requestsPerSecond ?? 10;
    this.minDelayMs = options.minDelayMs ?? 100;
  }

  /**
   * Queue a request to be executed with rate limiting
   */
  async throttle<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        requestFn,
        timestamp: Date.now(),
      });

      void this.processQueue();
    });
  }

  /**
   * Process the queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        break;
      }

      try {
        // Calculate delay based on time since last request
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredDelay = 1000 / this.requestsPerSecond; // ms between requests

        if (timeSinceLastRequest < requiredDelay) {
          const delay = requiredDelay - timeSinceLastRequest;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Execute the request
        this.lastRequestTime = Date.now();
        const result = await item.requestFn();
        item.resolve(result);
      } catch (error: unknown) {
        item.reject(error as Error);
      }

      // Small delay between requests to prevent bursts
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.minDelayMs));
      }
    }

    this.processing = false;
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.queue.forEach((item) => {
      item.reject(new Error("Request queue cleared"));
    });
    this.queue = [];
  }
}

// Export singleton instance for global use
export const requestThrottler = new RequestThrottler({
  requestsPerSecond: 10, // Max 10 requests per second
  minDelayMs: 100, // Minimum 100ms between requests
});

// Also export the class for custom instances
export { RequestThrottler };
