import Link, { LinkProps } from "next/link";
import { useRouter } from "next/router";
import { useCallback } from "react";

import { clearStateForNavigation } from "../../lib/navigation";

/**
 * Link component wrapper that handles explicit cleanup on click
 * Use this instead of Next.js Link when navigating between pages
 *
 * Example:
 *   <NavigationLink href="/galleries/123">Go to Gallery</NavigationLink>
 */
interface NavigationLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const NavigationLink: React.FC<NavigationLinkProps> = ({
  href,
  children,
  className,
  onClick,
  ...props
}) => {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Call custom onClick if provided
      if (onClick) {
        onClick(e);
      }

      // If navigation was prevented by custom handler, don't proceed
      if (e.defaultPrevented) {
        return;
      }

      // Get target URL
      const targetUrl = typeof href === "string" ? href : (href.pathname ?? router.asPath);

      // Clear state explicitly based on where we're going
      const currentUrl = router.asPath || router.pathname;
      clearStateForNavigation(currentUrl, targetUrl);
    },
    [href, router, onClick]
  );

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
};
