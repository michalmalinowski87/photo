"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { cn, NAV_LINKS } from "@/utils";
import { LucideIcon, Menu, X } from "lucide-react";
import Link from "next/link";
import React, { useState } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { getPublicDashboardUrl } from "@/lib/public-env";
import { PostHogActions } from "@photocloud/posthog-types";

const MobileNavbar = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { isAuthenticated, isLoading } = useAuth();
  const dashboardUrl = getPublicDashboardUrl();

  const handleClose = () => {
    setIsOpen(false);
    // TODO: Track mobile menu close when PostHog is installed
    // posthog.capture(PostHogActions.landing.mobileMenuClose);
  };

  const handleOpen = () => {
    setIsOpen(true);
    // TODO: Track mobile menu open when PostHog is installed
    // posthog.capture(PostHogActions.landing.mobileMenuOpen);
  };

  return (
    <div className="flex lg:hidden items-center justify-end">
      <Sheet open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          handleOpen();
        } else {
          handleClose();
        }
      }}>
        <SheetTrigger asChild>
          <Button 
            size="icon" 
            variant="ghost"
            data-ph-action={PostHogActions.landing.mobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-screen">
          <SheetTitle className="sr-only">Menu nawigacyjne</SheetTitle>
          <SheetDescription className="sr-only">
            Menu nawigacyjne z linkami do sekcji strony i opcjami logowania
          </SheetDescription>
          <SheetClose asChild className="absolute top-3 right-5 bg-background z-20 flex items-center justify-center">
            <Button 
              size="icon" 
              variant="ghost" 
              className="text-neutral-600"
              data-ph-action={PostHogActions.landing.mobileMenuClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </SheetClose>
          <div className="flex flex-col items-start w-full py-2 mt-10">
            <div className="flex items-center justify-evenly w-full space-x-2">
              {isLoading ? null : isAuthenticated ? (
                <Link href={`${dashboardUrl}/`} className={buttonVariants({ className: "w-full" })} onClick={handleClose}>
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link 
                    href={`${dashboardUrl}/login`} 
                    className={buttonVariants({ variant: "outline", className: "w-full" })} 
                    onClick={handleClose}
                    data-ph-action={PostHogActions.landing.navLoginClick}
                  >
                    Zaloguj się
                  </Link>
                  <Link 
                    href={`${dashboardUrl}/sign-up`} 
                    className={buttonVariants({ className: "w-full" })} 
                    onClick={handleClose}
                    data-ph-action={PostHogActions.landing.navSignupClick}
                  >
                    Rozpocznij za darmo
                  </Link>
                </>
              )}
            </div>
            <ul className="flex flex-col items-start w-full mt-6">
              <Accordion type="single" collapsible className="!w-full">
                {NAV_LINKS.map((link) => (
                  <AccordionItem key={link.title} value={link.title} className="last:border-none">
                    {link.menu ? (
                      <>
                        <AccordionTrigger>
                          {link.title}
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul
                            onClick={handleClose}
                            className={cn(
                              "w-full",
                            )}
                          >
                            {link.menu.map((menuItem) => (
                              <ListItem key={menuItem.title} title={menuItem.title} href={menuItem.href} icon={menuItem.icon}>
                                {menuItem.tagline}
                              </ListItem>
                            ))}
                          </ul>
                        </AccordionContent>
                      </>
                    ) : (
                      <Link
                        href={link.href}
                        onClick={handleClose}
                        className="flex items-center w-full py-4 font-medium text-muted-foreground hover:text-foreground"
                        data-ph-action={PostHogActions.landing.mobileMenuItemClick}
                        data-ph-property-landing_nav_item={link.title}
                      >
                        <span>{link.title}</span>
                      </Link>
                    )}
                  </AccordionItem>
                ))}
              </Accordion>
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
};

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { title: string; icon: LucideIcon }
>(({ className, title, href, icon: Icon, children, ...props }, ref) => {
  return (
    <li>
      <Link
        href={href!}
        ref={ref}
        className={cn(
          "block select-none space-y-1 rounded-lg p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          className
        )}
        data-ph-action={PostHogActions.landing.mobileMenuItemClick}
        data-ph-property-landing_nav_item={title}
        {...props}
      >
        <div className="flex items-center space-x-2 text-foreground">
          <Icon className="h-4 w-4" />
          <h6 className="text-sm !leading-none">
            {title}
          </h6>
        </div>
        <p title={children! as string} className="line-clamp-1 text-sm leading-snug text-muted-foreground">
          {children}
        </p>
      </Link>
    </li>
  )
})
ListItem.displayName = "ListItem"

export default MobileNavbar

