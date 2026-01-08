"use client";

import { buttonVariants } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn, NAV_LINKS } from "@/utils";
import { LucideIcon } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from 'react';
import MaxWidthWrapper from "../global/max-width-wrapper";
import MobileNavbar from "./mobile-navbar";
import AnimationContainer from "../global/animation-container";
import { useAuth } from "@/hooks/use-auth";

const Navbar = () => {
  const [scroll, setScroll] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';

  const handleScroll = () => {
    if (window.scrollY > 8) {
      setScroll(true);
    } else {
      setScroll(false);
    }
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header className={cn(
      "sticky top-0 inset-x-0 h-14 w-full border-b border-transparent z-[99999] select-none",
      scroll && "border-background/80 bg-background/40 backdrop-blur-md"
    )}>
      <AnimationContainer reverse delay={0.1} className="size-full">
        <MaxWidthWrapper className="flex items-center justify-between">
          <div className="flex items-center space-x-12">
            <Link href="/#home">
              <span className="text-lg font-bold font-heading !leading-none text-foreground">
                PhotoCloud
              </span>
            </Link>

            <NavigationMenu className="hidden lg:flex">
              <NavigationMenuList>
                {NAV_LINKS.map((link) => (
                  <NavigationMenuItem key={link.title}>
                    {link.menu ? (
                      <>
                        <NavigationMenuTrigger className="text-foreground">{link.title}</NavigationMenuTrigger>
                        <NavigationMenuContent>
                          <ul className={cn(
                            "grid gap-1 p-4 md:w-[400px] lg:w-[500px] rounded-xl",
                            link.title === "Funkcje" ? "lg:grid-cols-[.75fr_1fr]" : "lg:grid-cols-2"
                          )}>
                            {link.title === "Funkcje" && (
                              <li className="row-span-4 pr-2 relative rounded-lg overflow-hidden">
                                <div className="absolute inset-0 !z-10 h-full w-[calc(100%-10px)] bg-[linear-gradient(to_right,rgb(38,38,38,0.5)_1px,transparent_1px),linear-gradient(to_bottom,rgb(38,38,38,0.5)_1px,transparent_1px)] bg-[size:1rem_1rem]"></div>
                                <NavigationMenuLink asChild className="z-20 relative">
                                  <Link
                                    href="/features"
                                    className="flex h-full w-full select-none flex-col justify-end rounded-lg bg-gradient-to-b from-muted/50 to-muted p-4 no-underline outline-none focus:shadow-md"
                                  >
                                    <h6 className="mb-2 mt-4 text-lg font-medium text-foreground">
                                      Wszystkie funkcje
                                    </h6>
                                    <p className="text-sm leading-tight text-muted-foreground">
                                      Zarządzaj galeriami, udostępniaj zdjęcia i więcej.
                                    </p>
                                  </Link>
                                </NavigationMenuLink>
                              </li>
                            )}
                            {link.menu.map((menuItem) => (
                              <ListItem
                                key={menuItem.title}
                                title={menuItem.title}
                                href={menuItem.href}
                                icon={menuItem.icon}
                              >
                                {menuItem.tagline}
                              </ListItem>
                            ))}
                          </ul>
                        </NavigationMenuContent>
                      </>
                    ) : (
                      <NavigationMenuLink asChild>
                        <Link href={link.href} className={navigationMenuTriggerStyle()}>
                          {link.title}
                        </Link>
                      </NavigationMenuLink>
                    )}
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>

          </div>

          <div className="hidden lg:flex items-center gap-x-4">
            {isLoading ? null : isAuthenticated ? (
              <Link href={`${dashboardUrl}/`} className={buttonVariants({ size: "sm" })}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href={`${dashboardUrl}/login`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  Zaloguj się
                </Link>
                <Link href={`${dashboardUrl}/sign-up`} className={buttonVariants({ size: "sm" })}>
                  Rozpocznij za darmo
                </Link>
              </>
            )}
          </div>

          <MobileNavbar />

        </MaxWidthWrapper>
      </AnimationContainer>
    </header>
  )
};

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { title: string; icon: LucideIcon }
>(({ className, title, href, icon: Icon, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href!}
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-lg p-3 leading-none no-underline outline-none transition-all duration-100 ease-out hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="flex items-center space-x-2 text-neutral-300">
            <Icon className="h-4 w-4" />
            <h6 className="text-sm font-medium !leading-none text-foreground">
              {title}
            </h6>
          </div>
          <p title={children! as string} className="line-clamp-1 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  )
})
ListItem.displayName = "ListItem"

export default Navbar
