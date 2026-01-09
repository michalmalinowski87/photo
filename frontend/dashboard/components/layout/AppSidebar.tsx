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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useGalleries } from "../../hooks/queries/useGalleries";
import { usePrefetchGallery } from "../../hooks/usePrefetch";
import { useSidebar } from "../../hooks/useSidebar";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/react-query";
import api from "../../lib/api-service";

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
    name: "Ustawienia",
    icon: <Settings size={20} />,
    path: "/settings",
  },
  {
    name: "Strona główna",
    icon: <Globe size={20} />,
    path: process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002",
    external: true,
  },
];

const AppSidebar = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Check if there are galleries with "Prosba o zmiany" status
  const { data: prosbaOZmianyGalleries = [] } = useGalleries("prosba-o-zmiany");
  const hasProsbaOZmianyGalleries = prosbaOZmianyGalleries.length > 0;

  // Prefetch gallery list data for gallery filter routes
  const prefetchGalleryList = useCallback(
    (filter: string) => {
      // Prefetch the infinite query data for gallery lists
      void queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.galleries.infiniteList(filter, 20),
        queryFn: async ({ pageParam }) => {
          const response = await api.galleries.list(filter, {
            limit: 20,
            cursor: pageParam as string | null | undefined,
          });
          if (Array.isArray(response)) {
            return {
              items: response,
              hasMore: false,
              nextCursor: null,
            };
          }
          return response;
        },
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => {
          if (lastPage.hasMore && lastPage.nextCursor) {
            return lastPage.nextCursor;
          }
          return undefined;
        },
      });
    },
    [queryClient]
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => router.pathname === path, [router.pathname]);

  // Prefetch critical routes when sidebar mounts/expands for faster navigation
  useEffect(() => {
    if (!isExpanded && !isMobileOpen) {
      return; // Don't prefetch if sidebar is collapsed
    }

    // Prefetch all main navigation routes
    navItems.forEach((nav) => {
      if (nav.path && !nav.external) {
        // Prefetch the route to download its JavaScript bundle
        void router.prefetch(nav.path);
      }
      // Prefetch submenu routes
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          void router.prefetch(subItem.path);
        });
      }
    });
  }, [isExpanded, isMobileOpen, router]);

  useEffect(() => {
    let submenuMatched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenSubmenu({
              type: "main",
              index,
            });
            submenuMatched = true;
          }
        });
      }
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [router.pathname, isActive]);

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
                onMouseEnter={() => {
                  // Aggressive prefetching on hover for instant navigation
                  if (nav.path && !nav.external) {
                    void router.prefetch(nav.path);
                  }
                }}
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
                        // Aggressive prefetching on hover for instant navigation
                        void router.prefetch(subItem.path);
                        // Prefetch gallery list data for gallery filter routes
                        if (subItem.path.startsWith("/galleries/")) {
                          const filter = subItem.path.split("/").pop();
                          if (
                            filter &&
                            [
                              "robocze",
                              "wyslano",
                              "wybrano",
                              "prosba-o-zmiany",
                              "gotowe-do-wysylki",
                              "dostarczone",
                            ].includes(filter)
                          ) {
                            prefetchGalleryList(filter);
                          }
                        }
                      }}
                    >
                      <span>{subItem.name}</span>
                      {subItem.name === "Prośba o zmiany" && hasProsbaOZmianyGalleries && (
                        <AlertTriangle
                          size={18}
                          className="ml-auto text-orange-500 dark:text-orange-400 flex-shrink-0"
                        />
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
        <Link
          href="/"
          prefetch={true}
          className="transition active:scale-[0.98]"
          onMouseEnter={() => {
            // Prefetch dashboard on hover
            void router.prefetch("/");
          }}
        >
          <span className="text-2xl font-bold text-photographer-accent dark:text-white">
            PhotoCloud
          </span>
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderMenuItems(navItems)}</div>
          </div>
        </nav>
      </div>
      {(isExpanded || isMobileOpen) && (
        <div className="mt-auto pb-6 space-y-2">
          <Link
            href="/dev"
            prefetch={true}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-[0.98] ${
              router.pathname?.startsWith("/dev")
                ? "bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                : "text-gray-700 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/10"
            }`}
            onMouseEnter={() => {
              void router.prefetch("/dev");
            }}
          >
            <FlaskConical size={20} />
            <span>Dev Menu</span>
          </Link>
          <Link
            href="/login"
            prefetch={true}
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-photographer-text rounded-lg hover:bg-photographer-elevated dark:text-gray-400 dark:hover:bg-white/5 transition active:scale-[0.98]"
            onMouseEnter={() => {
              void router.prefetch("/login");
            }}
            onClick={async (e) => {
              e.preventDefault();
              if (typeof window !== "undefined") {
                const { signOut, getHostedUILogoutUrl } = await import("../../lib/auth");
                signOut();
                const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
                const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002";
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
