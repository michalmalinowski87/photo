"use client";

import { usePathname, useParams } from "next/navigation";
import { AuthProvider } from "@/providers/AuthProvider";

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const galleryId = params?.id as string || pathname?.match(/\/(?:gallery|login)\/([^/]+)/)?.[1] || null;

  return (
    <AuthProvider galleryId={galleryId || undefined}>
      {children}
    </AuthProvider>
  );
}
