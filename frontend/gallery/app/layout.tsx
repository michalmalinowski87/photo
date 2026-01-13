import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

// Import lightgallery CSS (loaded on all pages - small bundle, essential)
import "lightgallery/css/lightgallery.css";
import "lightgallery/css/lg-zoom.css";
import "lightgallery/css/lg-thumbnail.css";
import "lightgallery/css/lg-fullscreen.css";
import "lightgallery/css/lg-rotate.css";
// Note: Download functionality is built into lightGallery core, no separate CSS needed
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600"], // Include regular, medium, and semibold weights
});

export const metadata: Metadata = {
  title: "Gallery - PhotoCloud",
  description: "View and select your photos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-default antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
