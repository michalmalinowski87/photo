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
import { useSidebar } from "../../hooks/useSidebar";

import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  external?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <LayoutDashboard size={26} />,
    name: "Panel główny",
    path: "/",
  },
  {
    // eslint-disable-next-line jsx-a11y/alt-text
    icon: <Image size={26} aria-hidden="true" />,
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
    icon: <Users size={26} />,
    name: "Klienci",
    path: "/clients",
  },
  {
    name: "Pakiety",
    icon: <Package size={26} />,
    path: "/packages",
  },
  {
    name: "Portfel",
    icon: <Wallet size={26} />,
    path: "/wallet",
  },
  {
    name: "Ustawienia",
    icon: <Settings size={26} />,
    path: "/settings",
  },
  {
    name: "Strona główna",
    icon: <Globe size={26} />,
    path: process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002",
    external: true,
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const router = useRouter();

  // Check if there are galleries with "Prosba o zmiany" status
  const { data: prosbaOZmianyGalleries = [] } = useGalleries("prosba-o-zmiany");
  const hasProsbaOZmianyGalleries = prosbaOZmianyGalleries.length > 0;

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => router.pathname === path, [router.pathname]);

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
              } cursor-pointer lg:justify-start`}
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
                        ? "rotate-180 text-brand-500"
                        : ""
                    }`}
                  />
                </div>
              )}
            </button>
          ) : (
            nav.path &&
            (nav.external ? (
              <a href={nav.path} className="menu-item group menu-item-inactive">
                <span className="menu-item-icon-size menu-item-icon-inactive">{nav.icon}</span>
                {(isExpanded || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
              </a>
            ) : (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
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
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
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
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-7 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        w-[377px]
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
    >
      <div className="py-10 flex justify-start">
        <Link href="/">
          <span className="text-2xl font-bold text-brand-500">PhotoCloud</span>
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderMenuItems(navItems)}</div>
          </div>
        </nav>
        {(isExpanded || isMobileOpen) && <SidebarWidget />}
      </div>
      {(isExpanded || isMobileOpen) && (
        <div className="mt-auto pb-6 space-y-2">
          <Link
            href="/dev"
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              router.pathname?.startsWith("/dev")
                ? "bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                : "text-gray-700 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/10"
            }`}
          >
            <FlaskConical size={26} />
            <span>Dev Menu</span>
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
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
            <LogOut size={26} />
            <span>Wyloguj</span>
          </Link>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
