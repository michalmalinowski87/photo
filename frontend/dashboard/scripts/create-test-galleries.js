/**
 * Script to create 100 test galleries with random cover photos
 * 
 * Usage:
 * 1. Open browser console while logged into the dashboard
 * 2. Copy and paste this entire script
 * 3. Run: await createTestGalleries(100)
 * 
 * Or use in browser console:
 * - Copy the function code below
 * - Paste in console
 * - Call: await createTestGalleries(100)
 */

async function createTestGalleries(count = 100) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(/\/$/, '') + '/api';
  
  // Get auth token from localStorage
  const idToken = localStorage.getItem('idToken');
  if (!idToken) {
    throw new Error('Not logged in. Please log in first.');
  }

  console.log(`Creating ${count} test galleries...`);

  // Helper to download random image from Unsplash
  async function getRandomImage(width = 800, height = 600) {
    const imageId = Math.floor(Math.random() * 1000);
    const url = `https://picsum.photos/${width}/${height}?random=${imageId}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch image');
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.warn('Failed to fetch from Picsum, trying alternative...', error);
      // Fallback to placeholder service
      const altUrl = `https://source.unsplash.com/random/${width}x${height}?sig=${imageId}`;
      const response = await fetch(altUrl);
      const blob = await response.blob();
      return blob;
    }
  }

  // Helper to upload cover photo
  async function uploadCoverPhoto(galleryId, imageBlob) {
    try {
      // Step 1: Get presigned URL
      const timestamp = Date.now();
      const fileExtension = 'jpg';
      const key = `cover_${timestamp}.${fileExtension}`;
      
      const presignResponse = await fetch(`${API_URL}/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          galleryId,
          key,
          contentType: 'image/jpeg',
          fileSize: imageBlob.size,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.text();
        throw new Error(`Failed to get presigned URL: ${error}`);
      }

      const { url: presignedUrl } = await presignResponse.json();

      // Step 2: Upload to S3
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: imageBlob,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to S3');
      }

      // Step 3: Update gallery with S3 URL
      const s3Url = presignedUrl.split('?')[0]; // Remove query params
      const updateResponse = await fetch(`${API_URL}/galleries/${galleryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          coverPhotoUrl: s3Url,
        }),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update gallery: ${error}`);
      }

      // Wait a bit for CloudFront processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 4: Poll for CloudFront URL
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const coverResponse = await fetch(`${API_URL}/galleries/${galleryId}/cover-photo`, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
            },
          });

          if (coverResponse.ok) {
            const { coverPhotoUrl } = await coverResponse.json();
            if (coverPhotoUrl && !coverPhotoUrl.includes('.s3.') && !coverPhotoUrl.includes('s3.amazonaws.com')) {
              // CloudFront URL available, update gallery
              await fetch(`${API_URL}/galleries/${galleryId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  coverPhotoUrl,
                }),
              });
              return coverPhotoUrl;
            }
          }
        } catch (pollErr) {
          // Continue polling
        }
      }

      return s3Url; // Return S3 URL if CloudFront not ready
    } catch (error) {
      console.error(`Failed to upload cover photo for gallery ${galleryId}:`, error);
      return null;
    }
  }

  // Helper to create a gallery
  async function createGallery(index) {
    try {
      const galleryName = `Test Gallery ${index + 1}`;
      
      // Create gallery
      const createResponse = await fetch(`${API_URL}/galleries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          galleryName,
          selectionEnabled: true,
          pricingPackage: {
            includedCount: 10,
            extraPriceCents: 500,
            packagePriceCents: 5000,
          },
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create gallery: ${error}`);
      }

      const gallery = await createResponse.json();
      console.log(`✓ Created gallery ${index + 1}/${count}: ${gallery.galleryId}`);

      // Upload cover photo
      try {
        const imageBlob = await getRandomImage(800, 600);
        await uploadCoverPhoto(gallery.galleryId, imageBlob);
        console.log(`  ✓ Uploaded cover photo`);
      } catch (photoError) {
        console.warn(`  ⚠ Failed to upload cover photo:`, photoError);
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

      return gallery;
    } catch (error) {
      console.error(`✗ Failed to create gallery ${index + 1}:`, error);
      throw error;
    }
  }

  // Create galleries in batches to avoid overwhelming the system
  const batchSize = 5;
  const galleries = [];

  for (let i = 0; i < count; i += batchSize) {
    const batch = [];
    const batchEnd = Math.min(i + batchSize, count);
    
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(count / batchSize)} (galleries ${i + 1}-${batchEnd})...`);

    for (let j = i; j < batchEnd; j++) {
      try {
        const gallery = await createGallery(j);
        batch.push(gallery);
      } catch (error) {
        console.error(`Skipping gallery ${j + 1} due to error:`, error);
      }
    }

    galleries.push(...batch);

    // Longer delay between batches
    if (i + batchSize < count) {
      console.log('Waiting before next batch...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n✅ Successfully created ${galleries.length} galleries!`);
  console.log(`Gallery IDs:`, galleries.map(g => g.galleryId));
  
  return galleries;
}

// Export for use
if (typeof window !== 'undefined') {
  window.createTestGalleries = createTestGalleries;
}

// Auto-run if count is provided as argument
if (typeof process !== 'undefined' && process.argv) {
  const count = parseInt(process.argv[2] || '100', 10);
  createTestGalleries(count).catch(console.error);
}

