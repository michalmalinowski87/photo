"use client";

import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useState } from "react";

// Prevent static generation for this dev page and block in production
export const getServerSideProps: GetServerSideProps = () => {
  if (process.env.NODE_ENV !== "development") {
    return Promise.resolve({ notFound: true });
  }
  return Promise.resolve({ props: {} });
};

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";

export default function CreateTestGalleries() {
  const router = useRouter();
  const { showToast } = useToast();
  const [count, setCount] = useState(100);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });

  // Helper to download random image
  async function getRandomImage(width = 800, height = 600): Promise<Blob> {
    const imageId = Math.floor(Math.random() * 1000);
    const url = `https://picsum.photos/${width}/${height}?random=${imageId}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch image");
      return await response.blob();
    } catch (error) {
      console.warn("Failed to fetch from Picsum, trying alternative...", error);
      // Fallback
      const altUrl = `https://source.unsplash.com/random/${width}x${height}?sig=${imageId}`;
      const response = await fetch(altUrl);
      if (!response.ok) throw new Error("Failed to fetch fallback image");
      return await response.blob();
    }
  }

  // Helper to upload cover photo
  async function uploadCoverPhoto(galleryId: string, imageBlob: Blob): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const key = `cover_${timestamp}.jpg`;

      // Step 1: Get presigned URL
      const presignResponse = await api.uploads.getPresignedUrl({
        galleryId,
        key,
        contentType: "image/jpeg",
        fileSize: imageBlob.size,
      });

      // Step 2: Upload to S3
      await fetch(presignResponse.url, {
        method: "PUT",
        body: imageBlob,
        headers: {
          "Content-Type": "image/jpeg",
        },
      });

      // Step 3: Update gallery with S3 URL
      const s3Url = presignResponse.url.split("?")[0];
      await api.galleries.update(galleryId, { coverPhotoUrl: s3Url });

      // Step 4: Poll for CloudFront URL (simplified - just wait a bit)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        const coverResponse = await api.galleries.getCoverPhoto(galleryId);
        const fetchedUrl = coverResponse.coverPhotoUrl;
        if (
          fetchedUrl &&
          typeof fetchedUrl === "string" &&
          !fetchedUrl.includes(".s3.") &&
          !fetchedUrl.includes("s3.amazonaws.com")
        ) {
          await api.galleries.update(galleryId, { coverPhotoUrl: fetchedUrl });
          return fetchedUrl;
        }
      } catch {
        // Continue with S3 URL
      }

      return s3Url;
    } catch (error) {
      console.error(`Failed to upload cover photo for gallery ${galleryId}:`, error);
      return null;
    }
  }

  const handleCreate = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setProgress({ current: 0, total: count, message: "Starting..." });

    const galleries = [];
    const batchSize = 5;

    try {
      for (let i = 0; i < count; i += batchSize) {
        const batch = [];
        const batchEnd = Math.min(i + batchSize, count);

        setProgress({
          current: i,
          total: count,
          message: `Creating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(count / batchSize)}...`,
        });

        for (let j = i; j < batchEnd; j++) {
          try {
            // Create gallery
            const gallery = await api.galleries.create({
              galleryName: `Test Gallery ${j + 1}`,
              selectionEnabled: true,
              pricingPackage: {
                includedCount: 10,
                extraPriceCents: 500,
                packagePriceCents: 5000,
              },
            });

            // Upload cover photo
            try {
              const imageBlob = await getRandomImage(800, 600);
              await uploadCoverPhoto(gallery.galleryId, imageBlob);
            } catch (photoError) {
              console.warn(`Failed to upload cover photo for ${gallery.galleryId}:`, photoError);
            }

            batch.push(gallery);
            setProgress({
              current: j + 1,
              total: count,
              message: `Created gallery ${j + 1}/${count}`,
            });

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (error) {
            console.error(`Failed to create gallery ${j + 1}:`, error);
          }
        }

        galleries.push(...batch);

        // Delay between batches
        if (i + batchSize < count) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      showToast("success", "Sukces", `Utworzono ${galleries.length} galerii testowych!`);
      setProgress({
        current: count,
        total: count,
        message: `✅ Utworzono ${galleries.length} galerii!`,
      });

      // Optionally redirect to galleries list
      setTimeout(() => {
        void router.push("/galleries?filter=unpaid");
      }, 2000);
    } catch (error) {
      showToast("error", "Błąd", `Nie udało się utworzyć galerii: ${String(error)}`);
      console.error("Failed to create galleries:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Utwórz galerie testowe
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Liczba galerii do utworzenia
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 100)}
              disabled={isCreating}
              className="w-full px-4 py-2 border border-gray-400 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={isCreating || count < 1 || count > 500}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? "Tworzenie..." : `Utwórz ${count} galerii`}
          </button>

          {isCreating && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{progress.message}</span>
                <span>
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-photographer-muted dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Uwaga:</strong> Ta strona tworzy galerie testowe z losowymi zdjęciami
              okładkowymi. Galerie będą miały status &quot;Nieopublikowana&quot; (unpaid) i pojawią
              się w filtrze &quot;Wersje robocze&quot;.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
