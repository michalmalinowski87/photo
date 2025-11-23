import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../../lib/api';
import withClientAuth from '../../hocs/withClientAuth';
import { PurchaseView, ProcessedPhotosView, ImageModal } from '@photohub/gallery-components';

function ClientGallery({ token, clientId, galleryId, galleryName: initialGalleryName, mode }) {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState('');
	const [cloudfrontDomain, setCloudfrontDomain] = useState('');
	const [galleryName, setGalleryName] = useState(initialGalleryName || '');
	const [message, setMessage] = useState('');
	const [images, setImages] = useState([]);
	const [selectedKeys, setSelectedKeys] = useState(new Set());
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [galleryInfo, setGalleryInfo] = useState(null);
	const [modalImageIndex, setModalImageIndex] = useState(null);
	const [viewMode, setViewMode] = useState('purchase'); // 'purchase' or 'processed'
	const [finalImages, setFinalImages] = useState([]); // For modal display

	// Default to processed view if processed items exist after login
	useEffect(() => {
		if (galleryInfo?.hasDeliveredOrder && viewMode === 'purchase' && !loading) {
			setViewMode('processed');
		}
	}, [galleryInfo?.hasDeliveredOrder, loading]);

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
		setCloudfrontDomain(process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || '');
		setGalleryName(initialGalleryName || '');
	}, [initialGalleryName]);

	// Selections are stored in memory only - no auto-save needed
	// They will be persisted when client approves via approveSelection()

	// Load gallery on mount and when token is available
	useEffect(() => {
		if (apiUrl && galleryId && token && clientId) {
			loadGallery();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apiUrl, galleryId, token, clientId]);

	async function loadGallery() {
		setMessage('');
		setLoading(true);
		if (!apiUrl || !galleryId || !token) {
			setLoading(false);
			return;
		}
		try {
			// Load images, selection, and delivered orders in parallel with JWT authentication
			const [imagesResponse, selectionResponse, deliveredOrdersResponse] = await Promise.allSettled([
				apiFetch(`${apiUrl}/galleries/${galleryId}/images`, {
					headers: { 'Authorization': `Bearer ${token}` }
				}),
				clientId ? apiFetch(`${apiUrl}/galleries/${galleryId}/selections/${encodeURIComponent(clientId)}`, {
					headers: { 'Authorization': `Bearer ${token}` }
				}) : Promise.resolve(null),
				apiFetch(`${apiUrl}/galleries/${galleryId}/orders/delivered`, {
					headers: { 'Authorization': `Bearer ${token}` }
				})
			]);
			
			// Set images
			let loadedImages = [];
			if (imagesResponse.status === 'fulfilled') {
				const imagesData = imagesResponse.value.data;
				loadedImages = imagesData.images || [];
				setImages(loadedImages);
			} else {
				setImages([]);
			}
			
			// Check for delivered orders (fallback if selection endpoint doesn't return it)
			let hasDeliveredOrderFromOrders = false;
			if (deliveredOrdersResponse.status === 'fulfilled' && deliveredOrdersResponse.value) {
				const deliveredData = deliveredOrdersResponse.value.data;
				// Handle different response formats
				const items = deliveredData?.items || deliveredData?.orders || [];
				hasDeliveredOrderFromOrders = Array.isArray(items) && items.length > 0;
			}
			
			// Set selection
			let hasDeliveredOrder = false;
			if (clientId && selectionResponse.status === 'fulfilled' && selectionResponse.value) {
				let selectionData = selectionResponse.value.data;
				
				// Handle case where data might be a JSON string instead of parsed object
				if (typeof selectionData === 'string') {
					try {
						selectionData = JSON.parse(selectionData);
					} catch (e) {
						// Ignore parse errors
					}
				}
				
				// Handle various possible formats
				let keysArray = [];
				if (Array.isArray(selectionData?.selectedKeys)) {
					keysArray = selectionData.selectedKeys;
				} else if (selectionData?.selectedKeys && typeof selectionData.selectedKeys === 'string') {
					// Try parsing if it's a string
					try {
						const parsed = JSON.parse(selectionData.selectedKeys);
						keysArray = Array.isArray(parsed) ? parsed : [];
					} catch (e) {
						keysArray = [selectionData.selectedKeys];
					}
				} else if (selectionData?.selectedKeys) {
					keysArray = [selectionData.selectedKeys];
				}
				
				const currentKeys = new Set(keysArray);
				setSelectedKeys(currentKeys);
				hasDeliveredOrder = selectionData.hasDeliveredOrder || hasDeliveredOrderFromOrders;
				setGalleryInfo({
					approved: selectionData.approved || false,
					selectedCount: selectionData.selectedCount || 0,
					overageCount: selectionData.overageCount || 0,
					overageCents: selectionData.overageCents || 0,
					canSelect: selectionData.canSelect !== false, // Default to true if not provided
					changeRequestPending: selectionData.changeRequestPending || false,
					hasClientApprovedOrder: selectionData.hasClientApprovedOrder || false,
					hasDeliveredOrder: hasDeliveredOrder,
					selectionEnabled: selectionData.selectionEnabled !== false, // Gallery-level setting
					pricingPackage: selectionData.pricingPackage || { includedCount: 0, extraPriceCents: 0, packagePriceCents: 0 }
				});
				if (selectionData.approved) {
					setMessage('Selection already approved');
				}
				
				// ProcessedPhotosView will load delivered orders automatically
			} else {
				// Selection might not exist yet or endpoint failed - initialize with defaults
				setSelectedKeys(new Set());
				// Always initialize galleryInfo, use delivered orders check as fallback
				setGalleryInfo({
					approved: false,
					selectedCount: 0,
					overageCount: 0,
					overageCents: 0,
					canSelect: true,
					changeRequestPending: false,
					hasClientApprovedOrder: false,
					hasDeliveredOrder: hasDeliveredOrderFromOrders, // Use delivered orders check
					pricingPackage: { includedCount: 0, extraPriceCents: 0, packagePriceCents: 0 }
				});
			}
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setLoading(false);
		}
	}

	// Removed saveSelection function - selections are stored in memory only

	function toggleImage(key) {
		setSelectedKeys(prev => {
			const newSet = new Set(prev);
			if (newSet.has(key)) {
				newSet.delete(key);
			} else {
				newSet.add(key);
			}
			return newSet;
		});
	}

	function openModal(index) {
		setModalImageIndex(index);
	}

	function closeModal() {
		setModalImageIndex(null);
	}

	function navigateModal(direction) {
		if (modalImageIndex === null) return;
		const currentImages = viewMode === 'processed' ? finalImages : images;
		if (currentImages.length === 0) return;
		const newIndex = direction === 'next' 
			? (modalImageIndex + 1) % currentImages.length
			: (modalImageIndex - 1 + currentImages.length) % currentImages.length;
		setModalImageIndex(newIndex);
	}

	useEffect(() => {
		if (modalImageIndex === null) return;
		
		function handleKeyDown(e) {
			if (e.key === 'Escape') closeModal();
			if (e.key === 'ArrowLeft') navigateModal('prev');
			if (e.key === 'ArrowRight') navigateModal('next');
		}
		
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modalImageIndex]);

	async function approveSelection() {
		setMessage('');
		if (!apiUrl || !galleryId || !token) {
			setMessage('Not authenticated');
			return;
		}
		if (selectedKeys.size === 0) {
			setMessage('Please select at least one photo');
			return;
		}
		setSaving(true);
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/selections/approve`, {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({ selectedKeys: Array.from(selectedKeys) })
			});
			setMessage(`Approved! Order: ${data.orderId || 'N/A'}${data.zipKey ? `, ZIP: ${data.zipKey}` : ''}`);
			setGalleryInfo(prev => ({ ...prev, approved: true, canSelect: false }));
			// Reload gallery to get updated selection from order
			loadGallery();
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setSaving(false);
		}
	}

	async function requestChange() {
		setMessage('');
		if (!apiUrl || !galleryId || !token) {
			setMessage('Not authenticated');
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/selection-change-request`, {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({})
			});
			setMessage('Change requested. Waiting for photographer approval.');
			// Reload gallery info to update changeRequestPending status
			loadGallery();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function deletePhoto(filename) {
		if (!confirm(`Are you sure you want to delete "${filename}"? This will permanently delete the photo from originals, previews, and thumbnails.`)) {
			return;
		}
		setMessage('');
		if (!apiUrl || !galleryId || !token) {
			setMessage('Not authenticated');
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/photos/${encodeURIComponent(filename)}`, {
				method: 'DELETE',
				headers: { 'Authorization': `Bearer ${token}` }
			});
			const data = response.data;
			setMessage(`Photo deleted. Storage: ${data.storageUsedMB || 0} MB / ${data.storageLimitMB || 0} MB`);
			// Reload gallery to refresh images and storage
			loadGallery();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	// ProcessedPhotosView handles loading final images internally

	// Simplified flags from backend
	const canSelect = galleryInfo?.canSelect !== false; // Can select if no order or order is CLIENT_SELECTING
	const isApproved = galleryInfo?.approved || false;
	const changeRequestPending = galleryInfo?.changeRequestPending || false;
	const hasClientApprovedOrder = galleryInfo?.hasClientApprovedOrder || false;
	const canRequestChange = hasClientApprovedOrder && !changeRequestPending; // Can request changes if approved and not already pending 
	
	// If selection is disabled, always show processed view (no purchase/selection UI)
	// If there are no photos to select from, no active orders, but there are delivered orders, only show processed view
	// (all photos have been bought and delivered, nothing left to purchase)
	const hasNoPhotosToSelect = images.length === 0;
	const hasNoActiveOrders = !canSelect && !hasClientApprovedOrder; // No CLIENT_SELECTING or CLIENT_APPROVED orders
	const selectionDisabled = galleryInfo?.selectionEnabled === false;
	const shouldShowOnlyProcessed = selectionDisabled || (hasNoPhotosToSelect && hasNoActiveOrders && galleryInfo?.hasDeliveredOrder);
	
	// Force viewMode to 'processed' if selection is disabled or there's nothing to purchase
	useEffect(() => {
		if (shouldShowOnlyProcessed && viewMode === 'purchase') {
			setViewMode('processed');
		}
	}, [shouldShowOnlyProcessed, viewMode]);
	
	// Calculate overage in real-time
	const pricingPackage = galleryInfo?.pricingPackage || { includedCount: 0, extraPriceCents: 0, packagePriceCents: 0 };
	const currentSelectedCount = selectedKeys.size;
	
	// For "Purchase More" view (when there's a delivered order), each photo costs extra (no included count)
	// For first-time selection, use package pricing with included count
	const isPurchaseMore = viewMode === 'purchase' && galleryInfo?.hasDeliveredOrder;
	const includedCount = isPurchaseMore ? 0 : (pricingPackage.includedCount || 0);
	const extraPriceCents = pricingPackage.extraPriceCents || 0;
	const currentOverageCount = Math.max(0, currentSelectedCount - includedCount);
	const currentOverageCents = currentOverageCount * extraPriceCents;
	
	// Minimum selection enforcement (only for first-time selection, not purchase more)
	const minSelectionRequired = !isPurchaseMore && includedCount > 0 ? includedCount : 0;
	const meetsMinimumSelection = currentSelectedCount >= minSelectionRequired;

	function handleLogout() {
		if (galleryId) {
			localStorage.removeItem(`gallery_token_${galleryId}`);
			localStorage.removeItem(`gallery_name_${galleryId}`);
		}
		router.replace(`/gallery/login?id=${galleryId}`);
	}

	return (
		<div style={{ padding: 24, maxWidth: '100%', boxSizing: 'border-box' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ margin: 0 }}>{galleryName || 'Your Gallery'}</h1>
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
					{/* View Mode Toggle - Show if there are photos available AND there's a delivered order AND selection is enabled */}
					{galleryInfo?.hasDeliveredOrder === true && images.length > 0 && galleryInfo?.selectionEnabled !== false && (
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
								Purchase Additional
							</button>
						</div>
					)}
					<button 
						onClick={handleLogout}
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
						Logout
					</button>
				</div>
			</div>

			{/* Processed Photos View */}
			{viewMode === 'processed' && (
				<ProcessedPhotosView
					galleryId={galleryId}
					token={token}
					apiUrl={apiUrl}
					onImageClick={(index) => {
						setModalImageIndex(index);
					}}
					onFinalImagesChange={(images) => {
						setFinalImages(images);
					}}
					apiFetch={apiFetch}
				/>
			)}

			{/* Purchase Additional Photos View - Only show if selection is enabled */}
			{viewMode === 'purchase' && galleryInfo?.selectionEnabled !== false && (
				<PurchaseView
					galleryId={galleryId}
					images={images}
					selectedKeys={selectedKeys}
					onToggle={toggleImage}
					onDelete={null}
					onImageClick={openModal}
					galleryInfo={galleryInfo}
					onApprove={approveSelection}
					onRequestChange={requestChange}
					canSelect={canSelect}
					canRequestChange={canRequestChange}
					saving={saving}
					isPurchaseMore={isPurchaseMore}
					includedCount={includedCount}
					extraPriceCents={extraPriceCents}
					currentOverageCount={currentOverageCount}
					currentOverageCents={currentOverageCents}
					minSelectionRequired={minSelectionRequired}
					meetsMinimumSelection={meetsMinimumSelection}
					showDeleteButton={false}
				/>
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
						onToggle={canSelect ? toggleImage : null}
						canSelect={canSelect}
						isProcessed={viewMode === 'processed'}
						selectedKeys={selectedKeys}
					/>
				);
			})()}
		</div>
	);
}

export default withClientAuth(ClientGallery);
