/**
 * Script to delete all galleries with a specific status
 * 
 * Usage:
 * 1. Open browser console while logged into the dashboard
 * 2. Copy and paste this entire script
 * 3. Run: await deleteGalleriesByStatus('unpaid')
 * 
 * Available statuses:
 * - 'unpaid' - Nieopłacone (Wersje robocze)
 * - 'wyslano' - Wysłano do klienta
 * - 'wybrano' - Wybrano zdjęcia
 * - 'prosba-o-zmiany' - Prośba o zmiany
 * - 'gotowe-do-wysylki' - Gotowe do wysyłki
 * - 'dostarczone' - Dostarczone
 */

async function deleteGalleriesByStatus(status) {
  const VALID_STATUSES = ['unpaid', 'wyslano', 'wybrano', 'prosba-o-zmiany', 'gotowe-do-wysylki', 'dostarczone'];
  
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(/\/$/, '') + '/api';
  
  // Get auth token from localStorage
  const idToken = localStorage.getItem('idToken');
  if (!idToken) {
    throw new Error('Not logged in. Please log in first.');
  }

  const statusLabels = {
    'unpaid': 'Nieopłacone (Wersje robocze)',
    'wyslano': 'Wysłano do klienta',
    'wybrano': 'Wybrano zdjęcia',
    'prosba-o-zmiany': 'Prośba o zmiany',
    'gotowe-do-wysylki': 'Gotowe do wysyłki',
    'dostarczone': 'Dostarczone',
  };

  console.log(`Fetching galleries with status: ${statusLabels[status]}...`);

  // Helper to fetch all galleries with pagination
  async function fetchAllGalleries(filter) {
    const allGalleries = [];
    let lastKey = null;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ limit: '50' });
      if (filter) params.append('filter', filter);
      if (lastKey) params.append('lastKey', lastKey);

      const response = await fetch(`${API_URL}/galleries?${params}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch galleries: ${error}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      
      allGalleries.push(...items);
      
      hasMore = data.hasMore && data.lastKey;
      lastKey = data.lastKey;
      
      console.log(`  Fetched ${allGalleries.length} galleries so far...`);
    }

    return allGalleries;
  }

  // Fetch all galleries
  const galleries = await fetchAllGalleries(status);
  console.log(`\nFound ${galleries.length} galleries with status "${statusLabels[status]}"`);

  if (galleries.length === 0) {
    console.log('No galleries to delete.');
    return { deleted: 0, failed: 0, errors: [] };
  }

  // Confirm deletion
  const confirmed = confirm(
    `Czy na pewno chcesz usunąć wszystkie ${galleries.length} galerie ze statusem "${statusLabels[status]}"?\n\nTa operacja jest nieodwracalna!`
  );

  if (!confirmed) {
    console.log('Deletion cancelled.');
    return { deleted: 0, failed: 0, errors: [] };
  }

  console.log(`\nDeleting ${galleries.length} galleries...`);

  // Delete galleries in batches
  const batchSize = 5;
  const deleted = [];
  const failed = [];

  for (let i = 0; i < galleries.length; i += batchSize) {
    const batch = galleries.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (gallery) => {
      try {
        const response = await fetch(`${API_URL}/galleries/${gallery.galleryId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error);
        }

        deleted.push(gallery.galleryId);
        console.log(`  ✓ Deleted: ${gallery.galleryId}`);
      } catch (error) {
        failed.push({ id: gallery.galleryId, error: error.message });
        console.error(`  ✗ Failed to delete ${gallery.galleryId}:`, error.message);
      }
    });

    await Promise.all(batchPromises);

    // Progress update
    console.log(`Progress: ${deleted.length + failed.length}/${galleries.length} (${deleted.length} deleted, ${failed.length} failed)`);

    // Small delay between batches
    if (i + batchSize < galleries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ Deletion complete!`);
  console.log(`   Deleted: ${deleted.length}`);
  console.log(`   Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\nFailed deletions:`, failed);
  }

  return {
    deleted: deleted.length,
    failed: failed.length,
    errors: failed,
    deletedIds: deleted,
  };
}

// Export for use
if (typeof window !== 'undefined') {
  window.deleteGalleriesByStatus = deleteGalleriesByStatus;
}

// Example usage (commented out - uncomment to run automatically)
// await deleteGalleriesByStatus('unpaid');

