import { Inter } from "next/font/google";
import localFont from "next/font/local";

export const aeonik = localFont({
  src: [
    {
      path: "../../public/fonts/AeonikPro-Light.woff2",
      weight: "300",
    },
    {
      path: "../../public/fonts/AeonikPro-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../public/fonts/AeonikPro-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../public/fonts/AeonikPro-Bold.woff2",
      weight: "700",
    },
    {
      path: "../../public/fonts/AeonikPro-Black.woff2",
      weight: "900",
    }
  ],
  variable: "--font-aeonik",
  fallback: ["system-ui", "arial"],
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// LineIcons is an icon font - we'll optimize its loading via CSS import in layout
// The font file will be loaded efficiently by Next.js when CSS references it
// Note: Icon fonts require CSS classes, so we keep the CSS import but optimize loading
export const lineIcons = localFont({
  src: "../../public/assets/fonts/LineIcons.woff2",
  variable: "--font-lineicons",
  display: "swap",
  preload: false, // Icon fonts are loaded on-demand via CSS classes
});

