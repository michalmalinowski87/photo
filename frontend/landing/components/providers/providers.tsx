"use client";

import React from 'react';

interface Props {
  children: React.ReactNode;
}

// React Query is not used in landing pages (auth pages use direct API calls)
// This saves ~50KB+ bundle size on marketing pages
const Providers = ({ children }: Props) => {
  return <>{children}</>;
};

export default Providers

