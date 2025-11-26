import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import withOwnerAuth from '../../../hocs/withOwnerAuth';
import { apiFetchWithAuth, formatApiError } from '../../../lib/api';
import { GalleryThumbnails, ProcessedPhotosView, ImageModal } from '@photohub/gallery-components';

interface OwnerGalleryViewProps {
	token: string;
	ownerId: string;
	galleryId: string | string[] | undefined;
	mode: 'owner';
}

interface GalleryImage {
	key: string;
	url?: string;
	[key: string]: any;
}

interface Order {
	orderId: string;
	deliveryStatus?: string;
	selectedKeys?: string[];
	[key: string]: any;
}

interface GalleryInfo {
	galleryName?: string;
	[key: string]: any;
}

function OwnerGalleryView({ token, ownerId, galleryId, mode }: OwnerGalleryViewProps) {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState<string>('');
	const [galleryName, setGalleryName] = useState<string>('');
	const [message, setMessage] = useState<string>('');
	const [images, setImages] = useState<GalleryImage[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [galleryInfo, setGalleryInfo] = useState<GalleryInfo | null>(null);
	const [modalImageIndex, setModalImageIndex] = useState<number | null>(null);
	const [viewMode, setViewMode] = useState<'purchase' | 'processed'>('purchase');
	const [finalImages, setFinalImages] = useState<GalleryImage[]>([]);
	const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean>(false);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

	// Default to processed view if processed items exist after load
	useEffect(() => {
		if (hasDeliveredOrders && viewMode === 'purchase' && !loading) {
			setViewMode('processed');
		}
	}, [hasDeliveredOrders, loading, viewMode]);

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
	}, []);

	// Load gallery on mount
	useEffect(() => {
		if (apiUrl && galleryId && token) {
			loadGallery();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apiUrl, galleryId, token]);

	async function loadGallery(): Promise<void> {
		setMessage('');
		setLoading(true);
		if (!apiUrl || !galleryId || !token) {
			setLoading(false);
			return;
		}
		try {
			const [imagesResponse, deliveredOrdersResponse, ordersResponse] = await Promise.allSettled([
				apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/images`, {}, token),
				apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/orders/delivered`, {}, token),
				apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/orders`, {}, token)
			]);

			if (imagesResponse.status === 'fulfilled') {
				const imagesData = imagesResponse.value.data;
				setImages(imagesData.images || []);
			}

			// Check if there are delivered or preparing_delivery orders
			if (deliveredOrdersResponse.status === 'fulfilled') {
				const ordersData = deliveredOrdersResponse.value.data;
				const hasOrders = ordersData.items && ordersData.items.length > 0;
				setHasDeliveredOrders(hasOrders);
			} else {
				setHasDeliveredOrders(false);
			}

			// Get selected keys from active order (CLIENT_APPROVED, PREPARING_DELIVERY, or CHANGES_REQUESTED)
			if (ordersResponse.status === 'fulfilled') {
				const ordersData = ordersResponse.value.data;
				const orders = ordersData.items || [];
				
				// Find active order (approved, preparing delivery, or changes requested)
				const activeOrder = orders.find((o: Order) => 
					o.deliveryStatus === 'CLIENT_APPROVED' || 
					o.deliveryStatus === 'PREPARING_DELIVERY' || 
					o.deliveryStatus === 'CHANGES_REQUESTED'
				);
				
				if (activeOrder && activeOrder.selectedKeys && Array.isArray(activeOrder.selectedKeys)) {
					setSelectedKeys(new Set(activeOrder.selectedKeys));
				} else {
					setSelectedKeys(new Set());
				}
			} else {
				setSelectedKeys(new Set());
			}

			// Try to get gallery name from gallery info
			try {
				const galleryResponse = await apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}`, {}, token);
				const gallery = galleryResponse.data;
				setGalleryName(gallery.galleryName || (typeof galleryId === 'string' ? galleryId : ''));
				setGalleryInfo(gallery);
			} catch (e) {
				// Gallery info not available, that's OK
				setGalleryName(typeof galleryId === 'string' ? galleryId : '');
			}
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setLoading(false);
		}
	}

	async function deletePhoto(filename: string): Promise<void> {
		if (!confirm(`Are you sure you want to delete "${filename}"? This will permanently delete the photo from originals, previews, and thumbnails.`)) {
			return;
		}
		setMessage('');
		if (!apiUrl || !galleryId || !token) {
			setMessage('Not authenticated');
			return;
		}
		try {
			const response = await apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/photos/${encodeURIComponent(filename)}`, {
				method: 'DELETE'
			}, token);
			const data = response.data;
			setMessage(`Photo deleted. Storage: ${data.storageUsedMB || 0} MB / ${data.storageLimitMB || 0} MB`);
			// Reload gallery to refresh images and storage
			loadGallery();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	function openModal(index: number): void {
		setModalImageIndex(index);
	}

	function closeModal(): void {
		setModalImageIndex(null);
	}

	function navigateModal(direction: 'next' | 'prev'): void {
		if (modalImageIndex === null) return;
		const currentImages = viewMode === 'processed' ? finalImages : images;
		if (currentImages.length === 0) return;
		const newIndex = direction === 'next' 
			? (modalImageIndex + 1) % currentImages.length
			: (modalImageIndex - 1 + currentImages.length) % currentImages.length;
		setModalImageIndex(newIndex);
	}

	// If viewMode is 'processed' but there are no delivered orders, switch back to 'purchase'
	useEffect(() => {
		if (viewMode === 'processed' && !hasDeliveredOrders && !loading) {
			setViewMode('purchase');
		}
	}, [viewMode, hasDeliveredOrders, loading]);

	return (
		<div style={{ padding: 24, maxWidth: '100%', boxSizing: 'border-box' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ margin: 0 }}>{galleryName || 'Gallery View'}</h1>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<button
						onClick={() => loadGallery()}
						disabled={loading}
						style={{
							padding: '8px 16px',
							background: '#f0f0f0',
							color: '#333',
							border: '1px solid #ccc',
							borderRadius: 4,
							cursor: loading ? 'not-allowed' : 'pointer',
							fontSize: '14px'
						}}
						title="Refresh gallery data"
					>
						{loading ? 'Refreshing...' : 'Refresh'}
					</button>
					{/* View Mode Toggle - Only show if there are delivered/preparing_delivery orders */}
					{hasDeliveredOrders && (
						<div style={{ display: 'flex', gap: 4, background: '#f0f0f0', padding: 4, borderRadius: 8 }}>
							<button
								onClick={() => setViewMode('processed')}
								style={{
									padding: '8px 16px',
									background: viewMode === 'processed' ? '#0066cc' : 'transparent',
									color: viewMode === 'processed' ? 'white' : '#666',
									border: 'none',
									borderRadius: 4,
									cursor: 'pointer',
									fontSize: '14px',
									fontWeight: viewMode === 'processed' ? 'bold' : 'normal'
								}}
							>
								Processed Photos
							</button>
							<button
								onClick={() => setViewMode('purchase')}
								style={{
									padding: '8px 16px',
									background: viewMode === 'purchase' ? '#0066cc' : 'transparent',
									color: viewMode === 'purchase' ? 'white' : '#666',
									border: 'none',
									borderRadius: 4,
									cursor: 'pointer',
									fontSize: '14px',
									fontWeight: viewMode === 'purchase' ? 'bold' : 'normal'
								}}
							>
								Original Photos
							</button>
						</div>
					)}
					<button 
						onClick={() => router.push('/galleries')}
						style={{
							padding: '8px 16px',
							background: '#666',
							color: 'white',
							border: 'none',
							borderRadius: 4,
							cursor: 'pointer',
							fontSize: '14px'
						}}
					>
						Back to Galleries
					</button>
				</div>
			</div>

			{/* Processed Photos View */}
			{viewMode === 'processed' && (
				<ProcessedPhotosView
					galleryId={typeof galleryId === 'string' ? galleryId : ''}
					token={token}
					apiUrl={apiUrl}
					onImageClick={(index: number) => {
						setModalImageIndex(index);
					}}
					onFinalImagesChange={(images: GalleryImage[]) => {
						setFinalImages(images);
					}}
					apiFetch={(url: string, options: any) => apiFetchWithAuth(url, options, token)}
				/>
			)}

			{/* Purchase Additional Photos View */}
			{viewMode === 'purchase' && (
				<div>
					{/* Image Grid - Owner can view but not select, shows client's selection */}
					<GalleryThumbnails
						images={images}
						selectedKeys={selectedKeys}
						onToggle={null}
						onDelete={deletePhoto}
						onImageClick={openModal}
						canSelect={false}
						showDeleteButton={true}
					/>

					{images.length === 0 && !loading && apiUrl && galleryId && token && (
						<p style={{ color: '#666', marginTop: 24 }}>No images found. Make sure the gallery has uploaded photos.</p>
					)}
				</div>
			)}

			{message && (
				<div style={{ 
					marginTop: 16, 
					padding: 12, 
					background: message.includes('Error') ? '#ffe6e6' : '#e6f7e6',
					borderRadius: 4,
					color: message.includes('Error') ? '#cc0000' : '#006600'
				}}>
					{message}
				</div>
			)}

			{/* Image Modal */}
			{modalImageIndex !== null && (() => {
				const currentImages = viewMode === 'processed' ? finalImages : images;
				const currentImage = currentImages[modalImageIndex];
				if (!currentImage) return null;
				
				return (
					<ImageModal
						image={currentImage}
						images={currentImages}
						index={modalImageIndex}
						onClose={closeModal}
						onNavigate={navigateModal}
						onToggle={() => {}}
						canSelect={false}
						isProcessed={viewMode === 'processed'}
						selectedKeys={viewMode === 'purchase' ? selectedKeys : undefined}
					/>
				);
			})()}
		</div>
	);
}

export default withOwnerAuth(OwnerGalleryView);

