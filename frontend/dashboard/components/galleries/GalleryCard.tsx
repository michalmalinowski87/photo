import {
  Calendar,
  ShoppingBag,
  MoreVertical,
  Rocket,
  Eye,
  Trash2,
  Paperclip,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useState, useRef } from "react";

import type { Gallery } from "../../types";
import Badge from "../ui/badge/Badge";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Tooltip } from "../ui/tooltip/Tooltip";

interface GalleryCardProps {
  gallery: Gallery;
  onPublish?: (galleryId: string) => void;
  onDelete?: (gallery: Gallery) => void;
  onPrefetch?: (galleryId: string) => void;
}

export const GalleryCard = ({ gallery, onPublish, onDelete, onPrefetch }: GalleryCardProps) => {
  const [openActionMenu, setOpenActionMenu] = useState(false);
  const [imageError, setImageError] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const galleryName =
    typeof gallery.galleryName === "string"
      ? gallery.galleryName
      : typeof gallery.galleryId === "string"
        ? gallery.galleryId
        : "";

  // Truncate gallery name to 72 characters
  const MAX_NAME_LENGTH = 72;
  const displayName =
    galleryName.length > MAX_NAME_LENGTH
      ? `${galleryName.substring(0, MAX_NAME_LENGTH)}...`
      : galleryName;
  const fullName = galleryName || gallery.galleryId || "";

  const coverPhotoUrl = gallery.coverPhotoUrl as string | null | undefined;
  const createdAt = gallery.createdAt
    ? new Date(gallery.createdAt).toLocaleDateString("pl-PL")
    : "";

  // Get status badge
  const getStatusBadge = () => {
    if (gallery.isPaid === false) {
      return (
        <Badge color="error" variant="light" size="sm" startIcon={<Paperclip size={12} />}>
          Nieopublikowana
        </Badge>
      );
    }
    if (gallery.state === "PAID_ACTIVE") {
      return (
        <Badge color="success" variant="light" size="sm">
          Aktywne
        </Badge>
      );
    }
    if (gallery.state === "EXPIRED") {
      return (
        <Badge color="error" variant="light" size="sm">
          Wygasłe
        </Badge>
      );
    }
    return null;
  };

  // Check if gallery has photos
  const isSelectionGallery = gallery.selectionEnabled !== false;
  const hasPhotos = isSelectionGallery
    ? (gallery.originalsBytesUsed ?? 0) > 0
    : (gallery.finalsBytesUsed ?? 0) > 0 || (gallery.originalsBytesUsed ?? 0) > 0;

  // Get hashtags/categories (can be extended later)
  const hashtags: string[] = [];
  if (gallery.plan && typeof gallery.plan === "string") {
    hashtags.push(`#${gallery.plan.split("-")[0]}`);
  }

  // Get order count for display
  const orderCount = typeof gallery.orderCount === "number" ? gallery.orderCount : 0;

  // Calculate expiry date and color
  const getExpiryInfo = () => {
    const isPaid = gallery?.isPaid ?? false;
    let expiryDate: Date | null = null;

    // Use expiresAt for both paid and unpaid galleries
    if (gallery.expiresAt && typeof gallery.expiresAt === "string") {
      expiryDate = new Date(gallery.expiresAt);
    } else if (!isPaid && gallery.createdAt && typeof gallery.createdAt === "string") {
      // Fallback for unpaid: calculate 3 days from creation
      expiryDate = new Date(new Date(gallery.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000);
    }

    if (!expiryDate) {
      return { date: null, formatted: "-", color: "text-gray-500 dark:text-gray-400" };
    }

    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Format date as standard format (e.g., 5.12.2025)
    const formatted = expiryDate
      .toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })
      .replace(/\//g, ".");

    // Determine color based on time remaining
    let color: string;
    if (diffDays <= 7) {
      // Within 1 week: red
      color = "text-red-600 dark:text-red-400";
    } else if (diffDays <= 14) {
      // Within 2 weeks: orange
      color = "text-orange-600 dark:text-orange-400";
    } else {
      // Otherwise: primary-blue (brand color)
      color = "text-photographer-accent dark:text-photographer-accent";
    }

    return { date: expiryDate, formatted, color };
  };

  const expiryInfo = getExpiryInfo();

  return (
    <div className="bg-photographer-surface dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border border-photographer-border dark:border-gray-700 h-full flex flex-col relative">
      {/* Cover Photo Section */}
      <Link
        href={`/galleries/${gallery.galleryId}`}
        prefetch={true}
        onClick={() => {
          if (typeof window !== "undefined") {
            const referrerKey = `gallery_referrer_${gallery.galleryId}`;
            sessionStorage.setItem(referrerKey, window.location.pathname);
          }
        }}
        onMouseEnter={() => {
          onPrefetch?.(gallery.galleryId);
        }}
        className="relative h-56 bg-photographer-muted dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:opacity-90 transition-opacity cursor-pointer block"
      >
        {coverPhotoUrl && !imageError ? (
          <Image
            src={coverPhotoUrl}
            alt={galleryName || "Gallery cover"}
            fill
            className="object-cover"
            priority={false}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-photographer-border dark:bg-gray-600 flex items-center justify-center">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <ImageIcon
                className="w-12 h-12 text-photographer-mutedText dark:text-gray-500"
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {/* Status Badge - Top Left */}
        <div className="absolute top-3 left-3">{getStatusBadge()}</div>
      </Link>

      {/* More Options Menu - Top Right (outside Link to prevent navigation) */}
      <div className="absolute top-3 right-3 z-20">
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpenActionMenu(!openActionMenu);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-photographer-surface/90 dark:bg-gray-800/90 hover:bg-photographer-surface dark:hover:bg-gray-800 backdrop-blur-sm transition-colors"
          aria-label="More options"
        >
          <MoreVertical size={16} className="text-photographer-text dark:text-gray-300" />
        </button>
        <Dropdown
          isOpen={openActionMenu}
          onClose={() => setOpenActionMenu(false)}
          triggerRef={buttonRef.current ? { current: buttonRef.current } : undefined}
          className="w-48 bg-photographer-surface dark:bg-gray-900 shadow-xl"
        >
          {!gallery.isPaid && (
            <Tooltip
              content={!hasPhotos ? "Najpierw prześlij zdjęcia" : ""}
              side="left"
              align="center"
            >
              <div>
                <DropdownItem
                  onClick={() => {
                    if (hasPhotos && onPublish) {
                      onPublish(gallery.galleryId);
                      setOpenActionMenu(false);
                    }
                  }}
                  disabled={!hasPhotos}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-gray-800 first:rounded-t-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Rocket size={16} />
                  Opublikuj
                </DropdownItem>
              </div>
            </Tooltip>
          )}
          <div onMouseEnter={() => onPrefetch?.(gallery.galleryId)}>
            <DropdownItem
              tag="a"
              href={`/galleries/${gallery.galleryId}`}
              onItemClick={() => {
                setOpenActionMenu(false);
                if (typeof window !== "undefined") {
                  const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                  sessionStorage.setItem(referrerKey, window.location.pathname);
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-gray-800 ${
                gallery.isPaid ? "first:rounded-t-xl" : ""
              }`}
            >
              <Eye size={16} />
              Szczegóły
            </DropdownItem>
          </div>
          <DropdownItem
            onClick={() => {
              if (onDelete) {
                onDelete(gallery);
                setOpenActionMenu(false);
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 last:rounded-b-xl"
          >
            <Trash2 size={16} />
            Usuń
          </DropdownItem>
        </Dropdown>
      </div>

      {/* Content Section */}
      <div className="p-4 flex flex-col flex-1 min-h-0">
        {/* Gallery Name - Fixed height for 2 lines (48px = 3rem) */}
        <div className="h-12 mb-3">
          {galleryName.length > MAX_NAME_LENGTH ? (
            <Tooltip content={fullName} side="top" align="start">
              <Link
                href={`/galleries/${gallery.galleryId}`}
                prefetch={true}
                className="block font-semibold text-base text-photographer-heading dark:text-white hover:text-photographer-accent dark:hover:text-photographer-accent transition-colors line-clamp-2"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                    sessionStorage.setItem(referrerKey, window.location.pathname);
                  }
                }}
                onMouseEnter={() => {
                  // Prefetch gallery data (Next.js Link handles route bundle prefetching automatically)
                  onPrefetch?.(gallery.galleryId);
                }}
              >
                {displayName || gallery.galleryId}
              </Link>
            </Tooltip>
          ) : (
            <Link
              href={`/galleries/${gallery.galleryId}`}
              prefetch={true}
              className="block font-semibold text-base text-photographer-heading dark:text-white hover:text-photographer-accent dark:hover:text-photographer-accent transition-colors line-clamp-2"
              onClick={() => {
                if (typeof window !== "undefined") {
                  const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                  sessionStorage.setItem(referrerKey, window.location.pathname);
                }
              }}
              onMouseEnter={() => {
                // Prefetch gallery data (Next.js Link handles route bundle prefetching automatically)
                onPrefetch?.(gallery.galleryId);
              }}
            >
              {displayName || gallery.galleryId}
            </Link>
          )}
        </div>

        {/* Date and Hashtags - Flexible middle section */}
        <div className="flex-1 flex flex-col justify-start space-y-2 mb-3">
          {createdAt && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar size={14} />
              <span>{createdAt}</span>
            </div>
          )}

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hashtags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Icons Row - Fixed at bottom */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-400 dark:border-gray-700 mt-auto">
          <div className="flex items-center gap-4">
            <Tooltip content="Liczba zleceń">
              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <ShoppingBag size={16} />
                <span className="text-sm">{orderCount}</span>
              </div>
            </Tooltip>
            <Tooltip content="Ważna do">
              <div className={`flex items-center gap-1 ${expiryInfo.color}`}>
                <Calendar size={16} />
                <span className="text-sm font-medium">{expiryInfo.formatted}</span>
              </div>
            </Tooltip>
          </div>

          {/* Quick Publish Button (if unpaid) */}
          {!gallery.isPaid && hasPhotos && (
            <Tooltip content="Opublikuj">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPublish?.(gallery.galleryId);
                }}
                className="p-2 rounded-lg hover:bg-photographer-accentLight/50 dark:hover:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent transition-colors"
                aria-label="Opublikuj"
              >
                <Rocket size={18} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
