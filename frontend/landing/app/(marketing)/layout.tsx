"use client";

import React from 'react';
import NavbarBusiness from "@/components/navigation/navbar-business";
import FooterBusiness from "@/components/navigation/footer-business";
import ScrollToTop from "@/components/scroll-to-top";

interface Props {
  children: React.ReactNode
}

// Note: metadata and revalidate cannot be exported from client components
// These are handled at the page level for individual pages

const MarketingLayout = ({ children }: Props) => {
  // TODO: Track page views when PostHog is installed
  // useEffect(() => {
  //   const pathname = window.location.pathname;
  //   if (pathname === '/') {
  //     posthog.capture(PostHogActions.landing.homePageView);
  //   } else if (pathname === '/pricing') {
  //     posthog.capture(PostHogActions.landing.pricingPageView);
  //   } else if (pathname === '/features') {
  //     posthog.capture(PostHogActions.landing.featuresPageView);
  //   } else if (pathname?.startsWith('/features/')) {
  //     const featurePage = pathname.replace('/features/', '');
  //     posthog.capture(PostHogActions.landing.featurePageView, { landing_feature_page: featurePage });
  //   } else if (pathname === '/resources/help') {
  //     posthog.capture(PostHogActions.landing.helpPageView);
  //   }
  // }, []);

  return (
    <>
      <NavbarBusiness />
      <main className="mx-auto w-full">
        {children}
      </main>
      <FooterBusiness />
      <ScrollToTop />
    </>
  );
};

export default MarketingLayout

