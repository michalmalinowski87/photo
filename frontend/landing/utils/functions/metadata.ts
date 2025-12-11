import { Metadata } from "next";
import { APP_DOMAIN } from "../constants/site";

type GenerateMetadataOptions = {
  title?: string;
  description?: string;
  image?: string | null;
  icons?: Metadata["icons"];
  noIndex?: boolean;
};

export const generateMetadata = (options: GenerateMetadataOptions = {}): Metadata => {
  const {
    title = "PhotoCloud - Prosty sposób na udostępnianie zdjęć klientom",
    description = "PhotoCloud to prosty i opłacalny sposób na udostępnianie zdjęć klientom. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.",
    image = "/thumbnail.png",
    icons = [
      {
        rel: "apple-touch-icon",
        sizes: "32x32",
        url: "/apple-touch-icon.png"
      },
      {
        rel: "icon",
        sizes: "32x32",
        url: "/favicon-32x32.png"
      },
      {
        rel: "icon",
        sizes: "16x16",
        url: "/favicon-16x16.png"
      },
    ],
    noIndex = false
  } = options;

  return {
    metadataBase: new URL(APP_DOMAIN),
    title,
    description,
    icons,
    openGraph: {
      title,
      description,
      ...(image && { images: [{ url: image }] }),
    },
    twitter: {
      title,
      description,
      ...(image && { card: "summary_large_image", images: [image] }),
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
  };
};

