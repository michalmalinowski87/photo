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

  const fullImageUrl = image && image.startsWith('http') ? image : image ? `${APP_DOMAIN}${image}` : null;

  return {
    metadataBase: new URL(APP_DOMAIN),
    title,
    description,
    keywords: ["PhotoCloud", "fotografia", "udostępnianie zdjęć", "galerie zdjęć", "proofing", "fotograf", "klient"],
    authors: [{ name: "PhotoCloud" }],
    creator: "PhotoCloud",
    publisher: "PhotoCloud",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    icons,
    openGraph: {
      type: "website",
      locale: "pl_PL",
      url: APP_DOMAIN,
      siteName: "PhotoCloud",
      title,
      description,
      ...(fullImageUrl && {
        images: [
          {
            url: fullImageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(fullImageUrl && {
        images: [fullImageUrl],
      }),
      creator: "@photocloud",
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
  };
};

