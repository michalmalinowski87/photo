import {
  LayoutDashboard,
  Image,
  Users,
  Package,
  Globe,
  Wallet,
  Settings,
  ChevronDown,
  LogOut,
  AlertTriangle,
  FlaskConical,
  Gift,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useGalleries } from "../../hooks/queries/useGalleries";
import { useSidebar } from "../../hooks/useSidebar";
import { getPublicLandingUrl } from "../../lib/public-env";
import { shouldShowWatermarkWarningGlobal } from "../../lib/watermark-warning";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  external?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <LayoutDashboard size={20} />,
    name: "Panel główny",
    path: "/",
  },
  {
    // eslint-disable-next-line jsx-a11y/alt-text
    icon: <Image size={20} aria-hidden="true" />,
    name: "Galerie",
    subItems: [
      { name: "Wersje robocze", path: "/galleries/robocze" },
      { name: "Wysłano do klienta", path: "/galleries/wyslano" },
      { name: "Wybrano zdjęcia", path: "/galleries/wybrano" },
      { name: "Prośba o zmiany", path: "/galleries/prosba-o-zmiany" },
      { name: "Gotowe do wysyłki", path: "/galleries/gotowe-do-wysylki" },
      { name: "Dostarczone", path: "/galleries/dostarczone" },
    ],
  },
  {
    icon: <Users size={20} />,
    name: "Klienci",
    path: "/clients",
  },
  {
    name: "Pakiety",
    icon: <Package size={20} />,
    path: "/packages",
  },
  {
    name: "Portfel",
    icon: <Wallet size={20} />,
    path: "/wallet",
  },
  {
    name: "Zaproszenia i nagrody",
    icon: <Gift size={20} />,
    path: "/rewards",
  },
  {
    name: "Ustawienia",
    icon: <Settings size={20} />,
    subItems: [
      { name: "Konto", path: "/settings/account" },
      { name: "Bezpieczeństwo", path: "/settings/security" },
      { name: "Galeria", path: "/settings/gallery" },
    ],
  },
];

const AppSidebar = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const router = useRouter();
  const { data: businessInfo } = useBusinessInfo();
  const showWatermarkWarning =
    businessInfo !== undefined &&
    businessInfo !== null &&
    shouldShowWatermarkWarningGlobal(businessInfo);

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);

  // Check if there are galleries with "Prosba o zmiany" status
  // Only fetch when "Galerie" submenu is opened to avoid blocking navigation
  const shouldFetchProsba = openSubmenu?.type === "main" && openSubmenu?.index === 1; // Index 1 is "Galerie"
  const { data: prosbaOZmianyGalleries = [] } = useGalleries(
    "prosba-o-zmiany",
    undefined,
    undefined,
    undefined,
    {
      enabled: shouldFetchProsba, // Only fetch when "Galerie" submenu is opened
      staleTime: 5 * 60 * 1000, // 5 minutes - data doesn't change often
    }
  );
  const hasProsbaOZmianyGalleries = prosbaOZmianyGalleries.length > 0;
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string): boolean => {
      // For exact matches
      if (router.pathname === path) return true;
      // For dynamic routes, check if asPath matches
      if (router.asPath === path) return true;
      // For settings routes, check if we're on any settings page
      if (path.startsWith("/settings/") && router.asPath.startsWith("/settings/")) {
        return router.asPath === path;
      }
      return false;
    },
    [router.pathname, router.asPath]
  );

  // Prefetch all navigation routes when sidebar is visible/expanded
  // This ensures all navigation links are ready for instant navigation
  useEffect(() => {
    if (!router.isReady) {
      return; // Wait for router to be ready
    }

    if (!isExpanded && !isMobileOpen) {
      return; // Don't prefetch if sidebar is not visible
    }

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      // Collect all routes to prefetch
      const routesToPrefetch: string[] = [];

      navItems.forEach((nav) => {
        if (nav.path && !nav.external) {
          routesToPrefetch.push(nav.path);
        }
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (subItem.path) {
              routesToPrefetch.push(subItem.path);
            }
          });
        }
      });

      // Prefetch all routes
      // NOTE: Next.js prefetching only works in PRODUCTION mode, not in development
      // To test prefetching, run: npm run build && npm run start
      routesToPrefetch.forEach((path) => {
        // eslint-disable-next-line no-console
        console.warn("[Sidebar Prefetch] Prefetching route:", path);
        // router.prefetch() will prefetch the route bundle
        // In production, this triggers network requests for JS bundles
        // In development, Next.js disables prefetching to show latest changes
        void router
          .prefetch(path)
          .then(() => {
            // eslint-disable-next-line no-console
            console.warn("[Sidebar Prefetch] Successfully prefetched:", path);
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[Sidebar Prefetch] Failed to prefetch:", path, err);
          });
      });
    }, 1000); // Delay to not block initial render

    return () => clearTimeout(timeoutId);
  }, [isExpanded, isMobileOpen, router.isReady, router]);

  useEffect(() => {
    let submenuMatched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        // Check if any sub-item is active
        const hasActiveSubItem = nav.subItems.some((subItem) => {
          // For settings routes, check if we're on any settings page
          if (subItem.path.startsWith("/settings/")) {
            return router.asPath.startsWith("/settings/");
          }
          // For other routes, use the isActive function
          return isActive(subItem.path);
        });

        if (hasActiveSubItem) {
          setOpenSubmenu({
            type: "main",
            index,
          });
          submenuMatched = true;
        }
      }
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [router.pathname, router.asPath, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight ?? 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (prevOpenSubmenu?.type === "main" && prevOpenSubmenu.index === index) {
        return null;
      }
      return { type: "main", index };
    });
  };

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-2">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group ${
                openSubmenu?.type === "main" && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer lg:justify-start transition active:scale-[0.98]`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === "main" && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
              {(isExpanded || isMobileOpen) && (
                <div className="ml-auto flex items-center gap-2">
                  {nav.name === "Galerie" && hasProsbaOZmianyGalleries && (
                    <AlertTriangle
                      size={20}
                      className="text-orange-500 dark:text-orange-400 flex-shrink-0"
                    />
                  )}
                  {nav.name === "Ustawienia" && showWatermarkWarning && (
                    <span title="Znak wodny nie został ustawiony">
                      <AlertTriangle
                        size={20}
                        className="text-orange-500 dark:text-orange-400 flex-shrink-0"
                      />
                    </span>
                  )}
                  <ChevronDown
                    className={`w-6 h-6 transition-transform duration-200 ${
                      openSubmenu?.type === "main" && openSubmenu?.index === index
                        ? "rotate-180 text-photographer-accent"
                        : ""
                    }`}
                  />
                </div>
              )}
            </button>
          ) : (
            nav.path &&
            (nav.external ? (
              <a
                href={nav.path}
                className="menu-item group menu-item-inactive transition active:scale-[0.98]"
              >
                <span className="menu-item-icon-size menu-item-icon-inactive">{nav.icon}</span>
                {(isExpanded || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
              </a>
            ) : (
              <Link
                href={nav.path}
                prefetch={true}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                } transition active:scale-[0.98]`}
                // Next.js Link with prefetch={true} automatically prefetches when visible
                // No need for manual prefetch on hover - Next.js handles it more efficiently
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
              </Link>
            ))
          )}
          {nav.subItems && (isExpanded || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`main-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === "main" && openSubmenu?.index === index
                    ? `${subMenuHeight[`main-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      prefetch={true}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      } transition active:scale-[0.98]`}
                      onMouseEnter={() => {
                        // Aggressively prefetch route bundle on hover for slow connections
                        // This helps on slow 4G where downloading 190KB takes time
                        void router.prefetch(subItem.path);
                      }}
                    >
                      <span>{subItem.name}</span>
                      {subItem.name === "Prośba o zmiany" && hasProsbaOZmianyGalleries && (
                        <AlertTriangle
                          size={18}
                          className="ml-auto text-orange-500 dark:text-orange-400 flex-shrink-0"
                        />
                      )}
                      {subItem.name === "Galeria" && showWatermarkWarning && (
                        <span title="Znak wodny nie został ustawiony">
                          <AlertTriangle
                            size={18}
                            className="ml-auto text-orange-500 dark:text-orange-400 flex-shrink-0"
                          />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-7 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-photographer-heading h-screen transition-all duration-300 ease-in-out z-50 border-r border-photographer-border dark:border-gray-800 
        w-[283px]
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
    >
      <div className="py-10 flex justify-start">
        <Link href="/" prefetch={true} className="transition active:scale-[0.98]">
          <span className="text-2xl font-bold text-photographer-accent dark:text-white">
            PixiProof
          </span>
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar flex-1 min-h-0">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderMenuItems(navItems)}</div>
          </div>
        </nav>
      </div>
      {(isExpanded || isMobileOpen) && (
        <div className="mt-auto pb-6 space-y-2 flex-shrink-0">
          <Link
            href={getPublicLandingUrl()}
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-400 rounded-lg hover:bg-photographer-elevated dark:hover:bg-white/5 transition-colors active:scale-[0.98]"
          >
            <Globe size={20} />
            <span>Strona główna</span>
          </Link>
          {process.env.NODE_ENV === "development" && (
            <Link
              href="/dev"
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-[0.98] ${
                router.pathname?.startsWith("/dev")
                  ? "bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                  : "text-gray-700 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/10"
              }`}
            >
              <FlaskConical size={20} />
              <span>Dev Menu</span>
            </Link>
          )}
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-photographer-text rounded-lg hover:bg-photographer-elevated dark:text-gray-400 dark:hover:bg-white/5 transition active:scale-[0.98]"
            onClick={async (e) => {
              e.preventDefault();
              if (typeof window !== "undefined") {
                const { signOut, getHostedUILogoutUrl } = await import("../../lib/auth");
                signOut();
                const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
                const landingUrl = getPublicLandingUrl();
                if (userPoolDomain) {
                  const logoutUrl = getHostedUILogoutUrl(userPoolDomain, landingUrl);
                  window.location.href = logoutUrl;
                } else {
                  window.location.href = landingUrl;
                }
              }
            }}
          >
            <LogOut size={20} />
            <span>Wyloguj</span>
          </Link>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
