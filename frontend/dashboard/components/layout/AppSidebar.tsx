import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSidebar } from "../../context/SidebarContext";
import SidebarWidget from "./SidebarWidget";

// Simple icon components - we'll replace with actual SVG icons later
const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 2.5H7.5V7.5H2.5V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12.5 2.5H17.5V7.5H12.5V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.5 12.5H7.5V17.5H2.5V12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12.5 12.5H17.5V17.5H12.5V12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const HorizontaLDots = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
  </svg>
);

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 5H17.5M2.5 10H17.5M2.5 15H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const UserCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M0 18.3333C0 14.6519 3.015 11.6667 6.66667 11.6667H13.3333C16.985 11.6667 20 14.6519 20 18.3333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const BoxIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 5L10 9.16667L17.5 5M2.5 5L10 0.833336L17.5 5M2.5 5V15L10 19.1667L17.5 15V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DollarLineIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 1.66667V18.3333M13.3333 4.16667H8.33333C7.41286 4.16667 6.66667 4.91286 6.66667 5.83333C6.66667 6.75381 7.41286 7.5 8.33333 7.5H11.6667C12.5871 7.5 13.3333 8.24619 13.3333 9.16667C13.3333 10.0871 12.5871 10.8333 11.6667 10.8333H6.66667M13.3333 15.8333H8.33333C7.41286 15.8333 6.66667 15.0871 6.66667 14.1667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M16.25 10C16.25 10.2767 16.2233 10.5483 16.1717 10.8117L15.8333 12.5L16.1717 14.1883C16.2233 14.4517 16.25 14.7233 16.25 15C16.25 15.2767 16.2233 15.5483 16.1717 15.8117L15.8333 17.5L16.1717 19.1883C16.2233 19.4517 16.25 19.7233 16.25 20M3.75 0C3.75 0.276667 3.77667 0.548333 3.82833 0.811667L4.16667 2.5L3.82833 4.18833C3.77667 4.45167 3.75 4.72333 3.75 5C3.75 5.27667 3.77667 5.54833 3.82833 5.81167L4.16667 7.5L3.82833 9.18833C3.77667 9.45167 3.75 9.72333 3.75 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Panel główny",
    path: "/",
  },
  {
    icon: <ListIcon />,
    name: "Galerie",
    subItems: [
      { name: "Wersje robocze", path: "/galleries" },
      { name: "Wysłano do klienta", path: "/galleries/wyslano" },
      { name: "Wybrano zdjęcia", path: "/galleries/wybrano" },
      { name: "Prośba o zmiany", path: "/galleries/prosba-o-zmiany" },
      { name: "Gotowe do wysyłki", path: "/galleries/gotowe-do-wysylki" },
      { name: "Dostarczone", path: "/galleries/dostarczone" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Klienci",
    path: "/clients",
  },
  {
    name: "Pakiety",
    icon: <BoxIcon />,
    path: "/packages",
  },
  {
    name: "Portfel",
    icon: <DollarLineIcon />,
    path: "/wallet",
  },
  {
    name: "Ustawienia",
    icon: <SettingsIcon />,
    path: "/settings",
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const router = useRouter();

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string) => router.pathname === path,
    [router.pathname]
  );

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
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === "main" &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: "main", index };
    });
  };

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group ${
                openSubmenu?.type === "main" && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
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
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === "main" &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
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
                      {subItem.name}
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
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <span className="text-xl font-bold text-brand-500">PhotoHub</span>
          ) : (
            <span className="text-xl font-bold text-brand-500">PH</span>
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              {renderMenuItems(navItems)}
            </div>
          </div>
        </nav>
        {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}
      </div>
      {(isExpanded || isHovered || isMobileOpen) && (
        <div className="mt-auto pb-6">
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window !== "undefined") {
                const { signOut, getHostedUILogoutUrl } = require("../../lib/auth");
                signOut();
                const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
                const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3003";
                if (userPoolDomain) {
                  const logoutUrl = getHostedUILogoutUrl(userPoolDomain, landingUrl);
                  window.location.href = logoutUrl;
                } else {
                  window.location.href = landingUrl;
                }
              }
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.5 15L2.5 10M2.5 10L7.5 5M2.5 10H17.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Wyloguj</span>
          </Link>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
