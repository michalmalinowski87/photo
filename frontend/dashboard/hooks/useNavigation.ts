import { useRouter } from "next/router";
import { useCallback } from "react";

import { navigateWithCleanup, replaceWithCleanup } from "../lib/navigation";

/**
 * Hook that provides navigation functions with explicit cleanup
 * Use this instead of router.push/replace directly when user clicks navigation links
 *
 * Example:
 *   const { navigate } = useNavigation();
 *   <button onClick={() => navigate('/galleries/123')}>Go to Gallery</button>
 */
export const useNavigation = () => {
  const router = useRouter();

  const navigate = useCallback(
    (url: string, options?: Parameters<typeof router.push>[2]) => {
      return navigateWithCleanup(router, url, options);
    },
    [router]
  );

  const replace = useCallback(
    (url: string, options?: Parameters<typeof router.replace>[2]) => {
      return replaceWithCleanup(router, url, options);
    },
    [router]
  );

  return { navigate, replace, router };
};
