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

  log(category: string, action: string, data?: any, level: LogLevel = "info"): void {
    if (!this.enabled) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      action,
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
        console.error(prefix, style1, style2, message);
        break;
      case "warn":
        console.warn(prefix, style1, style2, message);
        break;
      case "debug":
        console.debug(prefix, style1, style2, message);
        break;
      default:
        console.log(prefix, style1, style2, message);
    }
  }

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
      if (typeof data === "object") {
        // If it's a simple object with few keys, show inline
        const keys = Object.keys(data);
        if (keys.length <= 3) {
          return JSON.stringify(data);
        }
        // For larger objects, show a summary
        return JSON.stringify(data, null, 2);
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

  logAction(category: string, actionName: string, params?: any, result?: any): void {
    if (!this.enabled) {
      return;
    }

    const actionKey = `${category}.${actionName}`;
    const count = (this.actionCallCounts.get(actionKey) || 0) + 1;
    this.actionCallCounts.set(actionKey, count);

    const data: any = {
      callCount: count,
    };
    if (params !== undefined) {
      data.params = params;
    }
    if (result !== undefined) {
      data.result = this.sanitizeResult(result);
    }

    this.log(category, `Action: ${actionName}`, data, "info");
  }

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
          firstItem: result[0] ? this.sanitizeResult(result[0]) : null,
        };
      }
      const keys = Object.keys(result);
      if (keys.length > 10) {
        return {
          type: "object",
          keys: keys.slice(0, 10),
          totalKeys: keys.length,
        };
      }
    }
    return result;
  }

  startTimer(key: string): void {
    if (!this.enabled) {
      return;
    }
    this.startTimes.set(key, Date.now());
  }

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

  logStateChange(
    slice: string,
    action: string,
    prevState: any,
    newState: any,
    changedFields?: string[]
  ): void {
    if (!this.enabled) {
      return;
    }

    const changes = changedFields
      ? changedFields.reduce(
          (acc, field) => {
            if (prevState[field] !== newState[field]) {
              acc[field] = {
                from: this.sanitizeValue(prevState[field]),
                to: this.sanitizeValue(newState[field]),
              };
            }
            return acc;
          },
          {} as Record<string, any>
        )
      : {};

    const hasChanges = Object.keys(changes).length > 0;

    this.log(
      slice,
      `State Change: ${action}`,
      {
        changes: hasChanges ? changes : "no changes",
        summary: hasChanges ? this.getStateSummary(newState) : undefined,
      },
      hasChanges ? "info" : "debug"
    );
  }

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
      const keys = Object.keys(value);
      if (keys.length > 5) {
        const sample: Record<string, any> = {};
        for (let i = 0; i < Math.min(3, keys.length); i++) {
          sample[keys[i]] = value[keys[i]];
        }
        return {
          type: "object",
          keyCount: keys.length,
          sample,
        };
      }
    }
    return value;
  }

  private getStateSummary(state: any): any {
    if (!state || typeof state !== "object") {
      return null;
    }

    const summary: Record<string, any> = {};

    // Common state fields to summarize
    if ("currentGallery" in state && state.currentGallery) {
      summary.currentGalleryId = state.currentGallery.galleryId;
      summary.galleryState = state.currentGallery.state;
      summary.galleryPaymentStatus = state.currentGallery.paymentStatus;
    }
    if ("currentOrder" in state && state.currentOrder) {
      summary.currentOrderId = state.currentOrder.orderId;
      summary.orderDeliveryStatus = state.currentOrder.deliveryStatus;
      summary.orderPaymentStatus = state.currentOrder.paymentStatus;
    }
    if ("walletBalanceCents" in state) {
      summary.walletBalanceCents = state.walletBalanceCents;
    }
    if ("isLoading" in state) {
      summary.isLoading = state.isLoading;
    }

    return Object.keys(summary).length > 0 ? summary : null;
  }

  logStateSnapshot(
    category: string,
    description: string,
    state: any,
    includeFullState = false
  ): void {
    if (!this.enabled) {
      return;
    }

    const snapshot: any = {
      description,
      timestamp: new Date().toISOString(),
    };

    if (includeFullState) {
      snapshot.fullState = state;
    } else {
      snapshot.summary = this.getStateSummary(state);
      snapshot.stateKeys = Object.keys(state || {});
    }

    this.log(category, `State Snapshot: ${description}`, snapshot, "info");
  }

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

  logFetch(
    slice: string,
    resource: string,
    action: "start" | "success" | "error",
    data?: any
  ): void {
    if (!this.enabled) {
      return;
    }
    const level = action === "error" ? "error" : "info";
    this.log(slice, `Fetch ${resource}: ${action.toUpperCase()}`, data, level);
  }

  logSkippedOperation(category: string, operation: string, reason: string, context?: any): void {
    if (!this.enabled) {
      return;
    }
    this.log(
      category,
      `⚠️ SKIPPED: ${operation}`,
      {
        reason,
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
  (window as any).storeLogger = storeLogger;
}
