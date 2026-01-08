import React from 'react';
import NavbarBusiness from "@/components/navigation/navbar-business";
import FooterBusiness from "@/components/navigation/footer-business";
import ScrollToTop from "@/components/scroll-to-top";

interface Props {
  children: React.ReactNode
}

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

