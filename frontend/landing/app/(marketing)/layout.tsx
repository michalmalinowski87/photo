import React from 'react';
import { Footer, Navbar } from "@/components";

interface Props {
  children: React.ReactNode
}

const MarketingLayout = ({ children }: Props) => {
  return (
    <>
      <div id="home" className="absolute inset-0 dark:bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[linear-gradient(to_right,#161616_1px,transparent_1px),linear-gradient(to_bottom,#161616_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)] pointer-events-none -z-10" />
      <div className="relative z-0">
        <Navbar />
        <main className="mx-auto w-full">
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
};

export default MarketingLayout

