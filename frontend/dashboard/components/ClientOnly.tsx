import { useState, ReactNode, useLayoutEffect } from "react";

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * ClientOnly component that only renders children on the client side
 * Prevents hydration mismatches by ensuring server and client render the same thing
 * Optimized to use useLayoutEffect for faster rendering
 */
export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  // Use useLayoutEffect for synchronous rendering before paint
  // This reduces the delay before children are rendered
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
