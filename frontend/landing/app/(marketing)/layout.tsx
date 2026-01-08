import React from 'react';
import { Metadata } from 'next';
import NavbarBusiness from "@/components/navigation/navbar-business";
import FooterBusiness from "@/components/navigation/footer-business";
import ScrollToTop from "@/components/scroll-to-top";
import { generateMetadata as baseGenerateMetadata } from '@/utils/functions/metadata';

interface Props {
  children: React.ReactNode
}

// Default metadata for marketing pages - can be overridden by individual pages
export const metadata: Metadata = baseGenerateMetadata({
  title: "PhotoCloud - Prosty sposób na udostępnianie zdjęć klientom",
  description: "PhotoCloud to prosty i opłacalny sposób na udostępnianie zdjęć klientom. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.",
});

// ISR: Revalidate every hour (3600 seconds) for all marketing pages
export const revalidate = 3600;

const MarketingLayout = ({ children }: Props) => {
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

