import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import api, { formatApiError } from "../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";
import { useGallery } from "../../../context/GalleryContext";
import { FullPageLoading, Loading } from "../../../components/ui/loading/Loading";
import { useToast } from "../../../hooks/useToast";
import Button from "../../../components/ui/button/Button";
import { ConfirmDialog } from "../../../components/ui/confirm/ConfirmDialog";
import { LimitExceededModal } from "../../../components/galleries/LimitExceededModal";

interface RetryableImageProps {
	src: string;
	alt: string;
	className?: string;
	maxRetries?: number;
	initialDelay?: number;
	fallbackSrc?: string;
}

interface GalleryImage {
	id?: string;
	key?: string;
	filename?: string;
	url?: string;
	thumbUrl?: string;
	thumbUrlFallback?: string;
	previewUrl?: string;
	previewUrlFallback?: string;
	isPlaceholder?: boolean;
	uploadTimestamp?: number;
	uploadIndex?: number;
	[key: string]: any;
}

interface UploadProgress {
	current: number;
	total: number;
	currentFileName: string;
	errors: Array<{ file: string; error: string }>;
	successes: number;
	startTime?: number; // UX IMPROVEMENT #4: Track upload start time
	lastUpdateTime?: number; // Track last update time for speed calculation
	uploadSpeed?: number; // Upload speed in bytes per second
	estimatedTimeRemaining?: number; // Estimated time remaining in seconds
}

// Lazy loading wrapper component using Intersection Observer
const LazyImage: React.FC<RetryableImageProps & { children: (src: string | null) => React.ReactNode }> = ({ src, children }) => {
	const [isInView, setIsInView] = useState<boolean>(false);
	const imgRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '50px' } // Start loading 50px before entering viewport
		);

		if (imgRef.current) {
			observer.observe(imgRef.current);
		}

		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<div ref={imgRef} className="w-full h-full">
			{isInView ? children(src) : children(null)}
		</div>
	);
};

// Component that retries loading an image until it's available on CloudFront
// Supports WebP with automatic fallback to JPEG
const RetryableImage: React.FC<RetryableImageProps> = ({ src, alt, className = "", maxRetries = 30, initialDelay = 500, fallbackSrc }) => {
	const [imageSrc, setImageSrc] = useState<string>(src);
	const [retryCount, setRetryCount] = useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [hasLoaded, setHasLoaded] = useState<boolean>(false);
	const [hasTriedFallback, setHasTriedFallback] = useState<boolean>(false);
	const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);

	useEffect(() => {
		// Reset when src changes
		setImageSrc(src);
		setRetryCount(0);
		setIsLoading(true);
		setHasLoaded(false);
		setHasTriedFallback(false);
		
		// Clear any pending retry
		if (retryTimeoutRef.current) {
			clearTimeout(retryTimeoutRef.current);
			retryTimeoutRef.current = null;
		}
		
		// Force image reload by clearing and setting src
		if (imgRef.current && src) {
			// Clear current src to force reload
			imgRef.current.src = '';
			// Use setTimeout to ensure the src is cleared before setting new one
			setTimeout(() => {
				if (imgRef.current && src) {
					imgRef.current.src = src;
				}
			}, 0);
		}
	}, [src]);

	const handleError = (): void => {
		setRetryCount((currentRetryCount) => {
			// If WebP fails and we have a fallback JPEG, try that first
			if (!hasTriedFallback && fallbackSrc && imageSrc === src) {
				setHasTriedFallback(true);
				setIsLoading(true);
				setHasLoaded(false);
				setImageSrc(fallbackSrc);
				if (imgRef.current) {
					imgRef.current.src = fallbackSrc;
				}
				return currentRetryCount;
			}
			
			const nextRetryCount = currentRetryCount + 1;
			
			if (currentRetryCount < maxRetries) {
				setIsLoading(true);
				setHasLoaded(false);
				
				// Exponential backoff: start with initialDelay, increase gradually
				const delay = Math.min(initialDelay * Math.pow(1.2, currentRetryCount), 5000);
				
				retryTimeoutRef.current = setTimeout(() => {
					// Add cache-busting query parameter
					const separator = imageSrc.includes('?') ? '&' : '?';
					const retryUrl = `${imageSrc}${separator}_t=${Date.now()}&_r=${nextRetryCount}`;
					
					setImageSrc(retryUrl);
					
					// Force reload the image
					if (imgRef.current) {
						imgRef.current.src = retryUrl;
					}
				}, delay);
				
				return nextRetryCount;
			} else {
				setIsLoading(false);
				setHasLoaded(false);
				return currentRetryCount;
			}
		});
	};

	const handleLoad = (): void => {
		setIsLoading(false);
		setHasLoaded(true);
		if (retryTimeoutRef.current) {
			clearTimeout(retryTimeoutRef.current);
			retryTimeoutRef.current = null;
		}
	};

	useEffect(() => {
		// Cleanup timeout on unmount
		return () => {
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
			}
		};
	}, []);

	return (
		<div className="relative w-full h-full">
			{isLoading && (
				<div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
					<div className="text-xs text-gray-500 dark:text-gray-400">
						Ładowanie zdjęcia...
					</div>
				</div>
			)}
			<img
				ref={imgRef}
				src={imageSrc}
				alt={alt}
				className={className}
				loading="lazy"
				onError={handleError}
				onLoad={handleLoad}
				style={{ 
					opacity: hasLoaded ? 1 : 0,
					transition: 'opacity 0.3s ease-in-out',
					display: hasLoaded ? 'block' : 'none'
				}}
			/>
		</div>
	);
};

export default function GalleryPhotos() {
	const router = useRouter();
	const { id: galleryId } = router.query;
	const { showToast } = useToast();
	const { gallery, loading: galleryLoading, reloadGallery } = useGallery();
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string>("");
	const [images, setImages] = useState<GalleryImage[]>([]);
	const previousImageKeysRef = useRef<Set<string>>(new Set()); // Track previous image keys for comparison (use ref to avoid infinite loops)
	const [approvedSelectionKeys, setApprovedSelectionKeys] = useState<Set<string>>(new Set()); // Images in approved/preparing orders (cannot delete)
	const [allOrderSelectionKeys, setAllOrderSelectionKeys] = useState<Set<string>>(new Set()); // Images in ANY order (show "Selected")
	const [uploading, setUploading] = useState<boolean>(false);
	const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
		current: 0,
		total: 0,
		currentFileName: '',
		errors: [],
		successes: 0,
	});
	const [isDragging, setIsDragging] = useState<boolean>(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
	const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
	const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set()); // Track which images are being deleted
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const uploadCancelRef = useRef<boolean>(false); // Track if upload was cancelled
	const [limitExceededData, setLimitExceededData] = useState<{
		uploadedSizeBytes: number;
		originalsLimitBytes: number;
		excessBytes: number;
		nextTierPlan?: string;
		nextTierPriceCents?: number;
		nextTierLimitBytes?: number;
		isSelectionGallery?: boolean;
	} | null>(null);

	// Define functions first (before useEffect hooks that use them)
	const loadPhotos = useCallback(async (silent: boolean = false): Promise<void> => {
		if (!galleryId) return;
		
		if (!silent) {
			setLoading(true);
			setError("");
		}
		
		try {
			const photosResponse = await api.galleries.getImages(galleryId as string);
			
			const newImages = photosResponse.images || [];
			
			// Compare with previous image keys to find truly new images
			// This is more reliable than comparing with current state
			const newImageKeys = new Set(newImages.map((img) => img.key || img.filename));
			const trulyNewImages = newImages.filter((img) => {
				const imgKey = img.key || img.filename;
				return imgKey && !previousImageKeysRef.current.has(imgKey);
			});
			
			// Update previous image keys for next comparison
			// This allows us to detect new images in the next poll immediately
			previousImageKeysRef.current = newImageKeys;
			
			// Merge new images with existing placeholders
			// Strategy: Replace placeholders with new images in correct order
			const now = Date.now();
			setImages((prevImages) => {
				// Separate placeholders and existing real images
				const existingPlaceholders = prevImages.filter((img) => img.isPlaceholder);
				const existingRealImages = prevImages.filter((img) => !img.isPlaceholder);
				
				// Create a map of existing real images by key for quick lookup
				const existingImageKeys = new Set(existingRealImages.map((img) => img.key || img.filename).filter(Boolean));
				
				// Find images that are truly new (not in our current list)
				const imagesToAdd = trulyNewImages.filter((img) => {
					const imgKey = img.key || img.filename;
					return imgKey && !existingImageKeys.has(imgKey);
				});
				
				// If we have new images and placeholders, replace placeholders with new images
				// Strategy: Replace placeholders one-to-one based on upload order (oldest placeholder = first new image)
				// This ensures consistent ordering even after page refresh
				if (imagesToAdd.length > 0 && existingPlaceholders.length > 0) {
					// Sort placeholders by upload timestamp, then by uploadIndex (oldest first, then by order)
					// This ensures consistent ordering - same order every time
					const sortedPlaceholders = [...existingPlaceholders].sort((a, b) => {
						const aTs = a.uploadTimestamp || 0;
						const bTs = b.uploadTimestamp || 0;
						if (aTs !== bTs) {
							return aTs - bTs;
						}
						return (a.uploadIndex || 0) - (b.uploadIndex || 0);
					});
					
					// Replace placeholders with new images (one-to-one replacement)
					// If we have 2 placeholders and 2 new images, replace both
					// If we have 3 placeholders and 2 new images, replace 2, keep 1
					const numToReplace = Math.min(imagesToAdd.length, sortedPlaceholders.length);
					const placeholdersToKeep = sortedPlaceholders.slice(numToReplace);
					
					// Keep only recent placeholders that weren't replaced (less than 15 seconds old)
					const recentPlaceholders = placeholdersToKeep.filter(
						(placeholder) => placeholder.uploadTimestamp && (now - placeholder.uploadTimestamp) < 15000
					);
					
					// IMPORTANT: Maintain order - existing real images, then new images (replacing placeholders),
					// then remaining placeholders. This ensures consistent ordering on refresh.
					return [...existingRealImages, ...imagesToAdd, ...recentPlaceholders];
				}
				
				// If no new images but we have placeholders, keep only recent ones
				if (existingPlaceholders.length > 0) {
					const recentPlaceholders = existingPlaceholders.filter(
						(placeholder) => placeholder.uploadTimestamp && (now - placeholder.uploadTimestamp) < 15000
					);
					
					// Remove any placeholders older than 30 seconds as a safety measure
					const finalPlaceholders = recentPlaceholders.filter(
						(placeholder) => placeholder.uploadTimestamp && (now - placeholder.uploadTimestamp) < 30000
					);
					
					return [...existingRealImages, ...finalPlaceholders];
				}
				
				// No placeholders, just return existing + new images
				return [...existingRealImages, ...imagesToAdd];
			});
		} catch (err) {
			if (!silent) {
				const errorMsg = formatApiError(err);
				setError(errorMsg);
				showToast("error", "Błąd", errorMsg || "Nie udało się załadować zdjęć");
			}
		} finally {
			if (!silent) {
				setLoading(false);
			}
		}
	}, [galleryId, showToast]);

	const loadApprovedSelections = useCallback(async (): Promise<void> => {
		if (!galleryId) return;
		
		try {
			const ordersResponse = await api.orders.getByGallery(galleryId as string);
			
			const orders = ordersResponse?.items || [];
			
			// Find orders with CLIENT_APPROVED or PREPARING_DELIVERY status (cannot delete)
			const approvedOrders = orders.filter(
				(o: any) => o.deliveryStatus === "CLIENT_APPROVED" || o.deliveryStatus === "PREPARING_DELIVERY"
			);
			
			// Collect all selected keys from approved orders
			const approvedKeys = new Set<string>();
			approvedOrders.forEach((order: any) => {
				if (order.selectedKeys && Array.isArray(order.selectedKeys)) {
					order.selectedKeys.forEach((key: string) => approvedKeys.add(key));
				}
			});
			
			setApprovedSelectionKeys(approvedKeys);
			
			// Collect all selected keys from ANY order (for "Selected" display)
			const allOrderKeys = new Set<string>();
			orders.forEach((order: any) => {
				if (order.selectedKeys && Array.isArray(order.selectedKeys)) {
					order.selectedKeys.forEach((key: string) => allOrderKeys.add(key));
				}
			});
			
			setAllOrderSelectionKeys(allOrderKeys);
		} catch (err) {
			// Don't show error toast - this is not critical
		}
	}, [galleryId]);

	// Initialize auth and load data
	useEffect(() => {
		initializeAuth(
			() => {
				if (galleryId) {
					loadPhotos();
					loadApprovedSelections();
				}
			},
			() => {
				redirectToLandingSignIn(`/galleries/${galleryId}/photos`);
			}
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [galleryId]); // Only depend on galleryId, not on the callback functions to avoid infinite loops

	const handleFileSelect = async (files: FileList | null): Promise<void> => {
		if (!files || files.length === 0) return;
		
		const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
		if (imageFiles.length === 0) {
			showToast("error", "Błąd", "Wybierz pliki graficzne");
			return;
		}
		
		// Note: Storage limits are now checked AFTER upload completes via validateUploadLimits endpoint
		// This allows upload-first workflow where plan is calculated based on actual uploaded size
		
		setUploading(true);
		uploadCancelRef.current = false; // Reset cancellation flag
		
		// Initialize upload progress with start time for speed calculation
		const startTime = Date.now();
		setUploadProgress({
			current: 0,
			total: imageFiles.length,
			currentFileName: '',
			errors: [],
			successes: 0,
			startTime,
			lastUpdateTime: startTime,
		});
		
		// Capture initial real image count BEFORE adding placeholders
		const initialRealImageCount = images.filter((img) => !img.isPlaceholder).length;
		
		// Create placeholders immediately for better UX
		// Use a unique timestamp per upload batch to track which placeholders belong together
		const uploadBatchId = Date.now();
		const placeholders: GalleryImage[] = imageFiles.map((file, index) => ({
			id: `placeholder_${uploadBatchId}_${index}`,
			key: file.name,
			filename: file.name,
			isPlaceholder: true,
			uploadTimestamp: uploadBatchId, // Same timestamp for all in this batch
			uploadIndex: index, // Track order within batch
		}));
		
		// Add placeholders to the images list immediately
		setImages((prevImages) => [...prevImages, ...placeholders]);
		
		try {
			// Helper function to retry a request with exponential backoff and jitter
			const retryWithBackoff = async <T,>(fn: () => Promise<T>, maxRetries: number = 5, baseDelay: number = 500): Promise<T> => {
				for (let attempt = 0; attempt < maxRetries; attempt++) {
					try {
						return await fn();
					} catch (error) {
						if (attempt === maxRetries - 1) throw error;
						// Exponential backoff with jitter: 0.5s, 1s, 2s, 4s, 8s
						const exponentialDelay = baseDelay * Math.pow(2, attempt);
						const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
						const delay = exponentialDelay + jitter;
						await new Promise(resolve => setTimeout(resolve, delay));
					}
				}
				throw new Error('Max retries exceeded');
			};
			
			// Dynamic batch sizing: start larger, reduce if errors occur
			let currentBatchSize = Math.min(15, Math.max(5, Math.floor(imageFiles.length / 10)));
			let consecutiveErrors = 0;
			const uploadErrors: Array<{ file: string; error: string }> = [];
			let uploadSuccesses = 0;
			
			// Process uploads in batches with adaptive sizing
			for (let i = 0; i < imageFiles.length; i += currentBatchSize) {
				// Check for cancellation
				if (uploadCancelRef.current) {
					throw new Error('Upload cancelled by user');
				}
				
				const batch = imageFiles.slice(i, i + currentBatchSize);
				let batchErrors = 0;
				
				// Process batch with individual error handling
				const batchResults = await Promise.allSettled(
					batch.map(async (file, batchIndex) => {
						const globalIndex = i + batchIndex;
						
						// Check for cancellation before each file
						if (uploadCancelRef.current) {
							throw new Error('Upload cancelled');
						}
						
						// UX IMPROVEMENT #4: Update progress with speed and time estimation
						const now = Date.now();
						setUploadProgress((prev) => {
							const elapsed = (now - (prev.startTime || now)) / 1000; // seconds
							const uploaded = globalIndex + 1;
							const remaining = imageFiles.length - uploaded;
							
							// Calculate average speed (files per second)
							const speed = elapsed > 0 ? uploaded / elapsed : 0;
							
							// Estimate time remaining
							const estimatedTimeRemaining = speed > 0 ? remaining / speed : 0;
							
							return {
								...prev,
								current: uploaded,
								currentFileName: file.name,
								lastUpdateTime: now,
								uploadSpeed: speed,
								estimatedTimeRemaining,
							};
						});
						
						try {
							// Use original filename with timestamp to avoid conflicts
							const timestamp = Date.now();
							const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
							const key = `originals/${timestamp}_${sanitizedFilename}`;
							
							// Get presigned URL with retry logic
							const presignResponse = await retryWithBackoff(async () => {
								return await api.uploads.getPresignedUrl({
									galleryId: galleryId as string,
									key,
									contentType: file.type || "image/jpeg",
									fileSize: file.size,
								});
							});
							
							// Upload file to S3 with timeout
							const uploadController = new AbortController();
							const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 min timeout
							
							try {
								await fetch(presignResponse.url, {
									method: "PUT",
									body: file,
									headers: {
										"Content-Type": file.type || "image/jpeg",
									},
									signal: uploadController.signal,
								});
								clearTimeout(uploadTimeout);
								uploadSuccesses++;
								return { success: true, file: file.name };
							} catch (uploadError) {
								clearTimeout(uploadTimeout);
								throw uploadError;
							}
						} catch (error) {
							const errorMessage = (error as Error).message || 'Unknown error';
							uploadErrors.push({ file: file.name, error: errorMessage });
							batchErrors++;
							return { success: false, file: file.name, error: errorMessage };
						}
					})
				);
				
				// Update progress with batch results
				setUploadProgress((prev) => ({
					...prev,
					successes: uploadSuccesses,
					errors: uploadErrors,
				}));
				
				// Adaptive batch sizing: reduce if too many errors, increase if successful
				if (batchErrors > 0) {
					consecutiveErrors++;
					// Reduce batch size if we're getting errors (minimum 3)
					currentBatchSize = Math.max(3, Math.floor(currentBatchSize * 0.7));
				} else {
					consecutiveErrors = 0;
					// Gradually increase batch size if successful (maximum 20)
					// Only increase if we've had a few successful batches in a row
					if (currentBatchSize < 20) {
						currentBatchSize = Math.min(20, Math.floor(currentBatchSize * 1.1));
					}
				}
				
				// Dynamic delay between batches based on batch size and errors
				// Larger batches = longer delay, errors = longer delay
				const baseDelay = 100;
				const errorPenalty = batchErrors * 50;
				const batchSizePenalty = currentBatchSize * 10;
				const delay = baseDelay + errorPenalty + batchSizePenalty;
				
				// Only delay if there are more batches to process
				if (i + currentBatchSize < imageFiles.length && !uploadCancelRef.current) {
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
			
			// Final progress update
			setUploadProgress((prev) => ({
				...prev,
				current: imageFiles.length,
				currentFileName: '',
			}));
			
			// Show summary toast
			if (uploadErrors.length === 0) {
				showToast("success", "Sukces", `Wszystkie ${imageFiles.length} zdjęć zostało przesłanych`);
			} else if (uploadSuccesses > 0) {
				showToast(
					"warning",
					"Częściowy sukces",
					`Przesłano ${uploadSuccesses} z ${imageFiles.length} zdjęć. ${uploadErrors.length} nie powiodło się.`
				);
			} else {
				showToast("error", "Błąd", `Nie udało się przesłać żadnego zdjęcia. Sprawdź konsolę.`);
			}
			
			// Validate upload limits after upload completes (if gallery has a plan)
			// Wait a bit for backend to process images and update originalsBytesUsed
			if (uploadSuccesses > 0 && gallery?.originalsLimitBytes) {
				try {
					// Wait a few seconds for backend processing
					await new Promise(resolve => setTimeout(resolve, 3000));
					
					const validationResult = await api.galleries.validateUploadLimits(galleryId as string);
					
					if (!validationResult.withinLimit && validationResult.excessBytes !== undefined) {
						// Limit exceeded - show modal
						setLimitExceededData({
							uploadedSizeBytes: validationResult.uploadedSizeBytes,
							originalsLimitBytes: validationResult.originalsLimitBytes!,
							excessBytes: validationResult.excessBytes,
							nextTierPlan: validationResult.nextTierPlan,
							nextTierPriceCents: validationResult.nextTierPriceCents,
							nextTierLimitBytes: validationResult.nextTierLimitBytes,
							isSelectionGallery: validationResult.isSelectionGallery,
						});
					}
				} catch (validationError) {
					// If validation fails, log but don't block user
					console.error('Failed to validate upload limits:', validationError);
				}
			}
			
			// Wait for backend to process images and update originalsBytesUsed
			// The resize Lambda processes images asynchronously, so we need to poll
			const initialOriginalsBytesUsed = gallery?.originalsBytesUsed || 0;
			const totalFilesSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
			const expectedOriginalsBytesUsed = initialOriginalsBytesUsed + totalFilesSize;
			
			// Use the initialRealImageCount captured before placeholders were added
			const expectedNewImageCount = imageFiles.length;
			
			// Poll for new images and updated originalsBytesUsed (backend processes images asynchronously)
			// All polling is silent to avoid page flicker
			let attempts = 0;
			const maxAttempts = 60; // 60 attempts = ~60 seconds max (images can take time to process)
			const pollInterval = 1000; // Check every second
			
			const pollForImages = async (): Promise<void> => {
				attempts++;
				
				try {
					// Fetch both gallery data and images in parallel
					const [galleryResponse, photosResponse] = await Promise.all([
						api.galleries.get(galleryId as string),
						api.galleries.getImages(galleryId as string),
					]);
					
					const currentOriginalsBytesUsed = galleryResponse?.originalsBytesUsed || 0;
					const currentImages = photosResponse?.images || [];
					const currentRealImageCount = currentImages.length;
					
					// Check if we have new images (more than initial count)
					const hasNewImages = currentRealImageCount >= initialRealImageCount + expectedNewImageCount;
					
					// Check if originalsBytesUsed has been updated (allow some tolerance for processing overhead)
					// We check if it's at least 80% of expected (to account for compression/processing differences)
					const hasBytesUpdated = currentOriginalsBytesUsed >= expectedOriginalsBytesUsed * 0.8;
					
					// Always reload photos to replace placeholders with real images
					// This will merge new images with placeholders intelligently
					await loadPhotos(true);
					
					// If we have new images AND bytes updated, or max attempts reached, stop polling
					if ((hasNewImages && hasBytesUpdated) || attempts >= maxAttempts) {
						// Silently reload gallery context to ensure originalsBytesUsed is up to date
						await reloadGallery();
						// Clean up tracking
						if ((window as any).__uploadTracking) {
							delete (window as any).__uploadTracking;
						}
						return;
					}
					
					// Continue polling silently
					setTimeout(pollForImages, pollInterval);
				} catch (err) {
					// On error, still reload photos and gallery context silently
					await loadPhotos(true);
					await reloadGallery();
					
					// Continue polling unless we've hit max attempts
					if (attempts < maxAttempts) {
						setTimeout(pollForImages, pollInterval);
					}
				}
			};
			
			// Start polling immediately (no artificial delay - check real state)
			setTimeout(pollForImages, 500); // Small initial delay to let backend start processing
		} catch (err) {
			// On error, remove placeholders
			setImages((prevImages) => prevImages.filter((img) => !img.isPlaceholder || (img.uploadTimestamp && img.uploadTimestamp < Date.now() - 1000)));
			
			if (uploadCancelRef.current) {
				showToast("info", "Anulowano", "Przesyłanie zostało anulowane");
			} else {
				const errorMsg = formatApiError(err) || "Nie udało się przesłać zdjęć";
				showToast("error", "Błąd", errorMsg);
			}
		} finally {
			setUploading(false);
			setUploadProgress({
				current: 0,
				total: 0,
				currentFileName: '',
				errors: [],
				successes: 0,
			});
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		setIsDragging(false);
		
		const files = e.dataTransfer.files;
		if (files && files.length > 0) {
			handleFileSelect(files);
		}
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDeletePhotoClick = (image: GalleryImage): void => {
		const imageKey = image.key || image.filename;
		
		if (!imageKey) return;
		
		// Prevent deletion if already being deleted
		if (deletingImages.has(imageKey)) {
			return;
		}
		
		// Check if image is in approved selection
		if (approvedSelectionKeys.has(imageKey)) {
			showToast(
				"error",
				"Błąd",
				"Nie można usunąć zdjęcia, które jest częścią zatwierdzonej selekcji klienta"
			);
			return;
		}
		
		// Check if deletion confirmation is suppressed
		const suppressKey = "photo_delete_confirm_suppress";
		const suppressUntil = localStorage.getItem(suppressKey);
		if (suppressUntil) {
			const suppressUntilTime = parseInt(suppressUntil, 10);
			if (Date.now() < suppressUntilTime) {
				// Suppression is still active, proceed directly with deletion
				handleDeleteConfirmDirect(image);
				return;
			} else {
				// Suppression expired, remove it
				localStorage.removeItem(suppressKey);
			}
		}
		
		setImageToDelete(image);
		setDeleteConfirmOpen(true);
	};

	const handleDeleteConfirmDirect = async (image: GalleryImage): Promise<void> => {
		const imageKey = image.key || image.filename;
		
		if (!imageKey || !galleryId) return;
		
		// Prevent duplicate deletions
		if (deletingImages.has(imageKey)) {
			return;
		}
		
		// Mark image as being deleted
		setDeletingImages((prev) => new Set(prev).add(imageKey));
		
		// Find image index before removing it (for error recovery)
		const imageIndex = images.findIndex((img) => (img.key || img.filename) === imageKey);
		
		// Optimistically remove image from local state immediately
		setImages((prevImages) => prevImages.filter((img) => (img.key || img.filename) !== imageKey));
		
		try {
			await api.galleries.deleteImage(galleryId as string, imageKey);
			
			// Only reload if no other deletions are in progress (to avoid race conditions)
			setDeletingImages((prev) => {
				const updated = new Set(prev);
				updated.delete(imageKey);
				// If this was the last deletion, reload gallery data
				if (updated.size === 0) {
					// Use setTimeout to ensure state update completes before reload
					setTimeout(() => {
						reloadGallery();
					}, 0);
				}
				return updated;
			});
			
			showToast("success", "Sukces", "Zdjęcie zostało usunięte");
		} catch (err) {
			// On error, restore the image to the list
			setImages((prevImages) => {
				const restored = [...prevImages];
				// Insert image back at its original position
				if (imageIndex >= 0 && imageIndex < restored.length) {
					restored.splice(imageIndex, 0, image);
				} else {
					restored.push(image);
				}
				return restored;
			});
			
			// Remove from deleting set
			setDeletingImages((prev) => {
				const updated = new Set(prev);
				updated.delete(imageKey);
				return updated;
			});
			
			showToast("error", "Błąd", formatApiError(err));
		}
	};

	const handleDeleteConfirm = async (suppressChecked: boolean): Promise<void> => {
		if (!imageToDelete) return;
		
		const imageKey = imageToDelete.key || imageToDelete.filename;
		
		if (!imageKey || !galleryId) return;
		
		// Prevent duplicate deletions
		if (deletingImages.has(imageKey)) {
			return;
		}
		
		// Mark image as being deleted
		setDeletingImages((prev) => new Set(prev).add(imageKey));
		
		// Find image index before removing it (for error recovery)
		const imageIndex = images.findIndex((img) => (img.key || img.filename) === imageKey);
		
		// Optimistically remove image from local state immediately
		setImages((prevImages) => prevImages.filter((img) => (img.key || img.filename) !== imageKey));
		
		try {
			await api.galleries.deleteImage(galleryId as string, imageKey);
			
			// Save suppression only after successful deletion
			if (suppressChecked) {
				const suppressKey = "photo_delete_confirm_suppress";
				const suppressUntil = Date.now() + 15 * 60 * 1000;
				localStorage.setItem(suppressKey, suppressUntil.toString());
			}
			
			setDeleteConfirmOpen(false);
			setImageToDelete(null);
			
			// Only reload if no other deletions are in progress (to avoid race conditions)
			setDeletingImages((prev) => {
				const updated = new Set(prev);
				updated.delete(imageKey);
				// If this was the last deletion, reload gallery data
				if (updated.size === 0) {
					// Use setTimeout to ensure state update completes before reload
					setTimeout(() => {
						reloadGallery();
					}, 0);
				}
				return updated;
			});
			
			showToast("success", "Sukces", "Zdjęcie zostało usunięte");
		} catch (err) {
			// On error, restore the image to the list
			setImages((prevImages) => {
				const restored = [...prevImages];
				// Insert image back at its original position
				if (imageIndex >= 0 && imageIndex < restored.length) {
					restored.splice(imageIndex, 0, imageToDelete);
				} else {
					restored.push(imageToDelete);
				}
				return restored;
			});
			
			// Remove from deleting set
			setDeletingImages((prev) => {
				const updated = new Set(prev);
				updated.delete(imageKey);
				return updated;
			});
			
			showToast("error", "Błąd", formatApiError(err));
		}
	};

	// Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
	if (galleryLoading) {
		return <FullPageLoading text="Ładowanie galerii..." />;
	}

	if (!gallery) {
		return null; // Error is handled by GalleryLayoutWrapper
	}

	const isImageInApprovedSelection = (image: GalleryImage): boolean => {
		const imageKey = image.key || image.filename;
		return imageKey ? approvedSelectionKeys.has(imageKey) : false;
	};
	
	const isImageInAnyOrder = (image: GalleryImage): boolean => {
		const imageKey = image.key || image.filename;
		return imageKey ? allOrderSelectionKeys.has(imageKey) : false;
	};

	return (
		<>
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
						Zdjęcia w galerii
					</h1>
					<div className="text-sm text-gray-500 dark:text-gray-400">
						{loading ? (
							<Loading size="sm" />
						) : (
							<>
								{images.length} {images.length === 1 ? "zdjęcie" : images.length < 5 ? "zdjęcia" : "zdjęć"}
							</>
						)}
					</div>
				</div>

				{/* Upload Progress Bar */}
				{uploading && uploadProgress.total > 0 && (
					<div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center space-x-3 flex-1">
								<div className="flex-1">
									<div className="flex items-center justify-between mb-1">
										<span className="text-sm font-medium text-gray-900 dark:text-white">
											Przesyłanie zdjęć...
										</span>
										<span className="text-sm text-gray-500 dark:text-gray-400">
											{uploadProgress.current} / {uploadProgress.total}
										</span>
									</div>
									{uploadProgress.currentFileName && (
										<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
											{uploadProgress.currentFileName}
										</p>
									)}
									{/* UX IMPROVEMENT #4: Show upload speed and estimated time */}
									{uploadProgress.uploadSpeed !== undefined && uploadProgress.uploadSpeed > 0 && (
										<div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
											<span>
												{uploadProgress.uploadSpeed.toFixed(1)} zdj./s
											</span>
											{uploadProgress.estimatedTimeRemaining !== undefined && uploadProgress.estimatedTimeRemaining > 0 && (
												<span>
													Pozostało: {Math.ceil(uploadProgress.estimatedTimeRemaining)}s
												</span>
											)}
										</div>
									)}
								</div>
							</div>
							<button
								onClick={() => {
									uploadCancelRef.current = true;
									setUploading(false);
								}}
								className="ml-4 px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 border border-error-300 dark:border-error-700 rounded-md hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
							>
								Anuluj
							</button>
						</div>
						<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
							<div
								className="bg-brand-500 h-2 rounded-full transition-all duration-300"
								style={{
									width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
								}}
							/>
						</div>
						{uploadProgress.errors.length > 0 && (
							<div className="mt-2 text-xs text-error-600 dark:text-error-400">
								Błędy: {uploadProgress.errors.length} | Sukcesy: {uploadProgress.successes}
							</div>
						)}
					</div>
				)}

				{/* Drag and Drop Upload Area */}
				<div
					className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
						isDragging
							? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
							: "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
					} ${uploading ? "opacity-50 pointer-events-none" : ""}`}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onClick={() => !uploading && fileInputRef.current?.click()}
				>
					<div className="p-8 text-center cursor-pointer">
						{uploading ? (
							<div className="space-y-2">
								<Loading size="lg" />
								<p className="text-sm text-gray-600 dark:text-gray-400">
									Przesyłanie zdjęć...
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<svg
									className="mx-auto h-12 w-12 text-gray-400"
									stroke="currentColor"
									fill="none"
									viewBox="0 0 48 48"
									aria-hidden="true"
								>
									<path
										d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<div className="text-sm text-gray-600 dark:text-gray-400">
									<span className="font-semibold text-brand-600 dark:text-brand-400">
										Kliknij aby przesłać
									</span>{" "}
									lub przeciągnij i upuść
								</div>
								<p className="text-xs text-gray-500 dark:text-gray-500">
									Obsługiwane formaty: JPEG, PNG
								</p>
								{(gallery?.originalsLimitBytes || gallery?.finalsLimitBytes) && (
									<div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
										{gallery?.originalsLimitBytes && (
											<div>
												<div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
													Oryginały: {((gallery.originalsBytesUsed || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB / {(gallery.originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
												</div>
												<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
													<div
														className={`h-2 rounded-full transition-all ${
															(gallery.originalsBytesUsed || 0) / gallery.originalsLimitBytes > 0.9
																? "bg-error-500"
																: (gallery.originalsBytesUsed || 0) / gallery.originalsLimitBytes > 0.75
																? "bg-warning-500"
																: "bg-brand-500"
														}`}
														style={{
															width: `${Math.min(
																((gallery.originalsBytesUsed || 0) / gallery.originalsLimitBytes) * 100,
																100
															)}%`,
														}}
													/>
												</div>
											</div>
										)}
										{gallery?.finalsLimitBytes && (
											<div>
												<div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
													Finalne: {((gallery.finalsBytesUsed || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB / {(gallery.finalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
												</div>
												<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
													<div
														className={`h-2 rounded-full transition-all ${
															(gallery.finalsBytesUsed || 0) / gallery.finalsLimitBytes > 0.9
																? "bg-error-500"
																: (gallery.finalsBytesUsed || 0) / gallery.finalsLimitBytes > 0.75
																? "bg-warning-500"
																: "bg-brand-500"
														}`}
														style={{
															width: `${Math.min(
																((gallery.finalsBytesUsed || 0) / gallery.finalsLimitBytes) * 100,
																100
															)}%`,
														}}
													/>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						)}
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/jpeg,image/png,image/jpg"
						multiple
						onChange={(e) => {
							if (e.target.files && e.target.files.length > 0) {
								handleFileSelect(e.target.files);
							}
						}}
						className="hidden"
					/>
				</div>

				{/* Images Grid */}
				{loading ? (
					<div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
						<Loading size="lg" text="Ładowanie zdjęć..." />
					</div>
				) : images.length === 0 ? (
					<div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
						<p className="text-gray-500 dark:text-gray-400">
							Brak zdjęć w galerii. Prześlij zdjęcia aby rozpocząć.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
						{images.map((img, idx) => {
							const isPlaceholder = img.isPlaceholder;
							const isApproved = isImageInApprovedSelection(img);
							const isInAnyOrder = isImageInAnyOrder(img);
							const imageKey = img.key || img.filename || '';
							
							return (
								<div
									key={img.id || imageKey || idx}
									className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-white dark:bg-gray-800 dark:border-gray-700 ${
										isPlaceholder ? "cursor-default" : ""
									}`}
								>
									<div className="aspect-square relative">
										{isPlaceholder ? (
											<div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
												<div className="text-center space-y-2">
													<Loading size="sm" />
													<div className="text-xs text-gray-500 dark:text-gray-400 px-2">
														Przetwarzanie...
													</div>
												</div>
											</div>
										) : (
											<>
												<LazyImage src={img.thumbUrl || img.previewUrl || img.url || ''}>
													{(lazySrc) => lazySrc ? (
														<RetryableImage
															src={lazySrc}
															fallbackSrc={img.thumbUrlFallback || img.previewUrlFallback}
															alt={imageKey}
															className="w-full h-full object-cover rounded-lg"
														/>
													) : (
														<div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
															<div className="text-xs text-gray-500 dark:text-gray-400">
																Ładowanie...
															</div>
														</div>
													)}
												</LazyImage>
												{isApproved && (
													<div className="absolute top-2 right-2 bg-success-500 text-white text-xs px-2 py-1 rounded z-20">
														Zatwierdzone
													</div>
												)}
												<div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center z-20">
													{isInAnyOrder ? (
														<div className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md bg-info-500 text-white">
															Wybrane
														</div>
													) : (
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleDeletePhotoClick(img);
															}}
															disabled={isApproved || deletingImages.has(imageKey)}
															className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
																isApproved || deletingImages.has(imageKey)
																	? "bg-gray-400 text-gray-200 cursor-not-allowed"
																	: "bg-error-500 text-white hover:bg-error-600"
															}`}
															title={
																isApproved
																	? "Nie można usunąć zdjęcia z zatwierdzonej selekcji"
																	: deletingImages.has(imageKey)
																	? "Usuwanie..."
																	: "Usuń zdjęcie"
															}
														>
															{deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń"}
														</button>
													)}
												</div>
											</>
										)}
									</div>
									{!isPlaceholder && (
										<div className="p-2">
											<p className="text-xs text-gray-600 dark:text-gray-400 truncate">
												{imageKey}
											</p>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Limit Exceeded Modal */}
			{limitExceededData && (
				<LimitExceededModal
					isOpen={!!limitExceededData}
					onClose={() => {
						setLimitExceededData(null);
					}}
					galleryId={galleryId as string}
					uploadedSizeBytes={limitExceededData.uploadedSizeBytes}
					originalsLimitBytes={limitExceededData.originalsLimitBytes}
					excessBytes={limitExceededData.excessBytes}
					nextTierPlan={limitExceededData.nextTierPlan}
					nextTierPriceCents={limitExceededData.nextTierPriceCents}
					nextTierLimitBytes={limitExceededData.nextTierLimitBytes}
					isSelectionGallery={limitExceededData.isSelectionGallery}
					onUpgrade={async () => {
						// Reload gallery after upgrade
						await reloadGallery();
						setLimitExceededData(null);
					}}
					onCancel={() => {
						// TODO: Implement file removal
						setLimitExceededData(null);
					}}
				/>
			)}

			{/* Delete Confirmation Dialog */}
			<ConfirmDialog
				isOpen={deleteConfirmOpen}
				onClose={() => {
					const imageKey = imageToDelete?.key || imageToDelete?.filename;
					if (!imageKey || !deletingImages.has(imageKey)) {
						setDeleteConfirmOpen(false);
						setImageToDelete(null);
					}
				}}
				onConfirm={handleDeleteConfirm}
				title="Usuń zdjęcie"
				message={imageToDelete ? `Czy na pewno chcesz usunąć zdjęcie "${imageToDelete.key || imageToDelete.filename}"?\nTa operacja jest nieodwracalna.` : ""}
				confirmText="Usuń"
				cancelText="Anuluj"
				variant="danger"
				loading={imageToDelete ? deletingImages.has(imageToDelete.key || imageToDelete.filename || '') : false}
				suppressKey="photo_delete_confirm_suppress"
			/>
		</>
	);
}

