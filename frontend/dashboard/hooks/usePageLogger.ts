import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";

import { storeLogger } from "../lib/store-logger";

interface PageLoggerOptions {
  pageName: string;
  logMount?: boolean;
  logUnmount?: boolean;
  logRouteChanges?: boolean;
  logStateChanges?: boolean;
}

/**
 * Hook for comprehensive page-level logging
 * Tracks mount/unmount, route changes, data loading, and state changes
 */
export const usePageLogger = (options: PageLoggerOptions) => {
  const router = useRouter();
  const { pageName, logMount = true, logUnmount = true, logRouteChanges = true } = options;
  const mountedRef = useRef(false);
  const prevPathRef = useRef<string>("");

  // Log page mount
  useEffect(() => {
    if (logMount && !mountedRef.current) {
      mountedRef.current = true;
      storeLogger.log("page", `${pageName}: Mounted`, {
        pathname: router.pathname,
        asPath: router.asPath,
        query: router.query,
        isReady: router.isReady,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName, router.pathname, router.asPath, router.isReady, logMount]);

  // Log route changes
  useEffect(() => {
    if (logRouteChanges && router.isReady) {
      const currentPath = router.asPath;
      if (prevPathRef.current && prevPathRef.current !== currentPath) {
        storeLogger.log("page", `${pageName}: Route Changed`, {
          from: prevPathRef.current,
          to: currentPath,
          pathname: router.pathname,
          query: router.query,
        });
      }
      prevPathRef.current = currentPath;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName, router.asPath, router.pathname, router.isReady, logRouteChanges]);

  // Log page unmount
  useEffect(() => {
    return () => {
      if (logUnmount && mountedRef.current) {
        storeLogger.log("page", `${pageName}: Unmounted`, {
          pathname: router.pathname,
          asPath: router.asPath,
        });
        mountedRef.current = false;
      }
    };
  }, [pageName, router.pathname, router.asPath, logUnmount]);

  // Helper functions for common logging patterns - memoized to prevent infinite loops
  const logDataLoad = useCallback(
    (dataType: string, params?: any, result?: any) => {
      storeLogger.logAction("page", `${pageName}: Load ${dataType}`, params, result);
      storeLogger.log("page", `${pageName}: Loading ${dataType}`, params);
    },
    [pageName]
  );

  const logDataLoaded = useCallback(
    (dataType: string, data: any, summary?: any) => {
      storeLogger.log("page", `${pageName}: ${dataType} Loaded`, {
        dataType,
        summary:
          summary ||
          (Array.isArray(data) ? { count: data.length } : { keys: Object.keys(data || {}) }),
      });
    },
    [pageName]
  );

  const logDataError = useCallback(
    (dataType: string, error: any) => {
      storeLogger.log(
        "page",
        `${pageName}: Error Loading ${dataType}`,
        { error: String(error) },
        "error"
      );
    },
    [pageName]
  );

  const logUserAction = useCallback(
    (action: string, params?: any) => {
      storeLogger.logAction("page", `${pageName}: User Action: ${action}`, params);
    },
    [pageName]
  );

  const logStateChange = useCallback(
    (stateName: string, oldValue: any, newValue: any) => {
      storeLogger.logStateChange(
        "page",
        `${pageName}: ${stateName}`,
        { [stateName]: oldValue },
        { [stateName]: newValue },
        [stateName]
      );
    },
    [pageName]
  );

  const logSkippedLoad = useCallback(
    (dataType: string, reason: string, context?: any) => {
      storeLogger.logSkippedOperation("page", `${pageName}: Load ${dataType}`, reason, context);
    },
    [pageName]
  );

  return {
    logDataLoad,
    logDataLoaded,
    logDataError,
    logUserAction,
    logStateChange,
    logSkippedLoad,
  };
};
