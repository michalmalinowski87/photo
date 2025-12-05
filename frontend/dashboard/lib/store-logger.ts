/**
 * Centralized store logging utility
 * Tracks state changes, loading states, actions, and inefficiencies across the app
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  duration?: number;
  stackTrace?: string;
}

class StoreLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private enabled = process.env.NODE_ENV === "development";
  private startTimes = new Map<string, number>();
  private actionCallCounts = new Map<string, number>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(category: string, action: string, data?: any, level: LogLevel = "info"): void {
    if (!this.enabled) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      action,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Format data for better readability
    const formattedData = this.formatData(data);
    const prefix = `%c[${category}]%c`;
    const message = `${action}${formattedData ? ` ${formattedData}` : ""}`;

    const categoryColor = this.getCategoryColor(category);
    const style1 = `color: ${categoryColor}; font-weight: bold;`;
    const style2 = "color: inherit;";

    switch (level) {
      case "error":
        // eslint-disable-next-line no-console
        console.error(prefix, style1, style2, message);
        break;
      case "warn":
        // eslint-disable-next-line no-console
        console.warn(prefix, style1, style2, message);
        break;
      case "debug":
        // eslint-disable-next-line no-console
        console.debug(prefix, style1, style2, message);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(prefix, style1, style2, message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatData(data: any): string {
    if (!data) {
      return "";
    }
    if (typeof data === "string") {
      return data;
    }
    if (typeof data === "number" || typeof data === "boolean") {
      return String(data);
    }

    try {
      // For objects, format more readably
      if (typeof data === "object" && data !== null) {
        // If it's a simple object with few keys, show inline
        const dataObj = data as Record<string, unknown>;
        const keys = Object.keys(dataObj);
        if (keys.length <= 3) {
          return JSON.stringify(dataObj);
        }
        // For larger objects, show a summary
        return JSON.stringify(dataObj, null, 2);
      }
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      gallery: "#818cf8", // indigo
      order: "#10b981", // green
      user: "#f59e0b", // amber
      dashboard: "#3b82f6", // blue
      component: "#8b5cf6", // purple
      api: "#ef4444", // red
    };
    return colors[category.toLowerCase()] || "#6b7280"; // gray
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logAction(category: string, actionName: string, params?: any, result?: any): void {
    if (!this.enabled) {
      return;
    }

    const actionKey = `${category}.${actionName}`;
    const count = (this.actionCallCounts.get(actionKey) ?? 0) + 1;
    this.actionCallCounts.set(actionKey, count);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      callCount: count,
    };
    if (params !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      data.params = params;
    }
    if (result !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      data.result = this.sanitizeResult(result);
    }

    this.log(category, `Action: ${actionName}`, data, "info");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sanitizeResult(result: any): any {
    if (!result) {
      return result;
    }
    if (typeof result === "object") {
      // For large objects, show summary
      if (Array.isArray(result)) {
        return {
          type: "array",
          length: result.length,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          firstItem: result[0] ? this.sanitizeResult(result[0]) : null,
        };
      }
      const resultObj = result as Record<string, unknown>;
      const keys = Object.keys(resultObj);
      if (keys.length > 10) {
        return {
          type: "object",
          keys: keys.slice(0, 10),
          totalKeys: keys.length,
        };
      }
      return JSON.stringify(resultObj, null, 2);
    }
    return result;
  }

  startTimer(key: string): void {
    if (!this.enabled) {
      return;
    }
    this.startTimes.set(key, Date.now());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endTimer(key: string, category: string, action: string, data?: any): void {
    if (!this.enabled) {
      return;
    }
    const startTime = this.startTimes.get(key);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.startTimes.delete(key);
      this.log(category, action, { ...data, duration: `${duration}ms` }, "debug");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logStateChange(
    slice: string,
    action: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prevState: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newState: any,
    changedFields?: string[]
  ): void {
    if (!this.enabled) {
      return;
    }

    const changes = changedFields
      ? changedFields.reduce(
          (acc, field) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (prevState[field] !== newState[field]) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
              acc[field] = {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                from: this.sanitizeValue(prevState[field]),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                to: this.sanitizeValue(newState[field]),
              };
            }
            return acc;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {} as Record<string, any>
        )
      : {};

    const hasChanges = Object.keys(changes).length > 0;

    this.log(
      slice,
      `State Change: ${action}`,
      {
        changes: hasChanges ? changes : "no changes",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        summary: hasChanges ? this.getStateSummary(newState) : undefined,
      },
      hasChanges ? "info" : "debug"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sanitizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return {
          type: "array",
          length: value.length,
          preview: value.slice(0, 3),
        };
      }
      // For objects, show key count and sample
      const valueObj = value as Record<string, unknown>;
      const keys = Object.keys(valueObj);
      if (keys.length > 5) {
        const sample: Record<string, unknown> = {};
        for (let i = 0; i < Math.min(3, keys.length); i++) {
          sample[keys[i]] = valueObj[keys[i]];
        }
        return {
          type: "object",
          keyCount: keys.length,
          sample,
        };
      }
      return JSON.stringify(valueObj);
    }
    return value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getStateSummary(state: any): any {
    if (!state || typeof state !== "object") {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary: Record<string, any> = {};

    // Common state fields to summarize
    const stateObj = state as Record<string, unknown>;
    if ("currentGallery" in stateObj && stateObj.currentGallery) {
      const currentGallery = stateObj.currentGallery as Record<string, unknown>;
      summary.currentGalleryId = currentGallery.galleryId;
      summary.galleryState = currentGallery.state;
      summary.galleryPaymentStatus = currentGallery.paymentStatus;
    }
    if ("currentOrder" in stateObj && stateObj.currentOrder) {
      const currentOrder = stateObj.currentOrder as Record<string, unknown>;
      summary.currentOrderId = currentOrder.orderId;
      summary.orderDeliveryStatus = currentOrder.deliveryStatus;
      summary.orderPaymentStatus = currentOrder.paymentStatus;
    }
    if ("walletBalanceCents" in state) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      summary.walletBalanceCents = (state as { walletBalanceCents?: unknown }).walletBalanceCents;
    }
    if ("isLoading" in state) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      summary.isLoading = (state as { isLoading?: unknown }).isLoading;
    }

    return Object.keys(summary).length > 0 ? summary : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logStateSnapshot(
    category: string,
    description: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: any,
    includeFullState = false
  ): void {
    if (!this.enabled) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot: any = {
      description,
      timestamp: new Date().toISOString(),
    };

    if (includeFullState) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      snapshot.fullState = state;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      snapshot.summary = this.getStateSummary(state);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      snapshot.stateKeys = Object.keys(state ?? {});
    }

    this.log(category, `State Snapshot: ${description}`, snapshot, "info");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logLoadingState(slice: string, action: string, isLoading: boolean, context?: any): void {
    if (!this.enabled) {
      return;
    }
    this.log(
      slice,
      `Loading: ${isLoading ? "START" : "END"}`,
      { action, ...context },
      isLoading ? "debug" : "info"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logFetch(
    slice: string,
    resource: string,
    action: "start" | "success" | "error",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any
  ): void {
    if (!this.enabled) {
      return;
    }
    const level = action === "error" ? "error" : "info";
    this.log(slice, `Fetch ${resource}: ${action.toUpperCase()}`, data, level);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logSkippedOperation(category: string, operation: string, reason: string, context?: any): void {
    if (!this.enabled) {
      return;
    }
    this.log(
      category,
      `⚠️ SKIPPED: ${operation}`,
      {
        reason,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        context,
        note: "This may be a workaround/patch that should be reviewed",
      },
      "warn"
    );
  }

  getLogs(category?: string, limit?: number): LogEntry[] {
    let filtered = this.logs;
    if (category) {
      filtered = filtered.filter((log) => log.category === category);
    }
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    return filtered;
  }

  getActionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.actionCallCounts.forEach((count, key) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      stats[key] = count;
    });
    return stats;
  }

  logActionStats(): void {
    if (!this.enabled) {
      return;
    }
    const stats = this.getActionStats();
    if (Object.keys(stats).length > 0) {
      this.log("logger", "Action Statistics", stats, "info");
    }
  }

  clearLogs(): void {
    this.logs = [];
    this.startTimes.clear();
    this.actionCallCounts.clear();
  }

  exportLogs(): string {
    return JSON.stringify(
      {
        logs: this.logs,
        actionStats: this.getActionStats(),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }
}

export const storeLogger = new StoreLogger();

// Expose to window for debugging
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (window as any).storeLogger = storeLogger;
}
