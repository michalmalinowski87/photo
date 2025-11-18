import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../../lib/api';

export default function ClientGallery() {
	const router = useRouter();
	const { id } = router.query;
	const [apiUrl, setApiUrl] = useState('');
	const [cloudfrontDomain, setCloudfrontDomain] = useState('');
	const [token, setToken] = useState('');
	const [clientId, setClientId] = useState('');
	const [galleryName, setGalleryName] = useState('');
	const [message, setMessage] = useState('');
	const [images, setImages] = useState([]);
	const [selectedKeys, setSelectedKeys] = useState(new Set());
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [galleryInfo, setGalleryInfo] = useState(null);
	const [modalImageIndex, setModalImageIndex] = useState(null);
	const [checkingAuth, setCheckingAuth] = useState(true);
	const [viewMode, setViewMode] = useState('purchase'); // 'purchase' or 'processed'
	const [finalImages, setFinalImages] = useState([]);
	const [loadingFinalImages, setLoadingFinalImages] = useState(false);
	const [downloadingFinalZip, setDownloadingFinalZip] = useState(false);
	const [deliveredOrders, setDeliveredOrders] = useState([]);
	const [loadingDeliveredOrders, setLoadingDeliveredOrders] = useState(false);
	const [selectedOrderId, setSelectedOrderId] = useState(null); // null = list view, orderId = specific order view

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
		setCloudfrontDomain(process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || '');
	}, []);

	// Check authentication on mount
	useEffect(() => {
		if (!id || !apiUrl) return;

		const storedToken = localStorage.getItem(`gallery_token_${id}`);
		const storedName = localStorage.getItem(`gallery_name_${id}`);
		
		if (!storedToken) {
			// No token, redirect to login
			router.replace(`/gallery/login?id=${id}`);
			return;
		}

		// Decode token to get clientId (simple base64 decode of payload)
		try {
			const payload = JSON.parse(atob(storedToken.split('.')[1]));
			setToken(storedToken);
			setClientId(payload.clientId);
			if (storedName) {
				setGalleryName(storedName);
			}
			setCheckingAuth(false);
		} catch (e) {
			// Invalid token, redirect to login
			localStorage.removeItem(`gallery_token_${id}`);
			localStorage.removeItem(`gallery_name_${id}`);
			router.replace(`/gallery/login?id=${id}`);
		}
	}, [id, apiUrl, router]);

	// Selections are stored in memory only - no auto-save needed
	// They will be persisted when client approves via approveSelection()

	// Load gallery on mount and when token is available
	useEffect(() => {
		if (!checkingAuth && apiUrl && id && token && clientId) {
			loadGallery();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [checkingAuth, apiUrl, id, token, clientId]);

	async function loadGallery() {
		setMessage('');
		setLoading(true);
		if (!apiUrl || !id || !token) {
			setLoading(false);
			return;
		}
		try {
			// Load images and selection in parallel with JWT authentication
			const [imagesResponse, selectionResponse] = await Promise.allSettled([
				apiFetch(`${apiUrl}/galleries/${id}/images`, {
					headers: { 'Authorization': `Bearer ${token}` }
				}),
				clientId ? apiFetch(`${apiUrl}/galleries/${id}/selections/${encodeURIComponent(clientId)}`, {
					headers: { 'Authorization': `Bearer ${token}` }
				}) : Promise.resolve(null)
			]);
			
			// Set images
			if (imagesResponse.status === 'fulfilled') {
				const imagesData = imagesResponse.value.data;
				setImages(imagesData.images || []);
			} else {
				setImages([]);
			}
			
			// Set selection
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
				setGalleryInfo({
					approved: selectionData.approved || false,
					selectedCount: selectionData.selectedCount || 0,
					overageCount: selectionData.overageCount || 0,
					overageCents: selectionData.overageCents || 0,
					canSelect: selectionData.canSelect !== false, // Default to true if not provided
					changeRequestPending: selectionData.changeRequestPending || false,
					hasClientApprovedOrder: selectionData.hasClientApprovedOrder || false,
					hasDeliveredOrder: selectionData.hasDeliveredOrder || false,
					pricingPackage: selectionData.pricingPackage || { includedCount: 0, extraPriceCents: 0 }
				});
				if (selectionData.approved) {
					setMessage('Selection already approved');
				}
				
				// Load delivered orders if there are delivered orders
				if (selectionData.hasDeliveredOrder) {
					loadDeliveredOrders();
				}
			} else if (clientId) {
				// Selection might not exist yet, that's OK - start with empty selection
				setSelectedKeys(new Set());
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
		if (!apiUrl || !id || !token) {
			setMessage('Not authenticated');
			return;
		}
		if (selectedKeys.size === 0) {
			setMessage('Please select at least one photo');
			return;
		}
		setSaving(true);
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${id}/selections/approve`, {
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
		if (!apiUrl || !id || !token) {
			setMessage('Not authenticated');
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${id}/selection-change-request`, {
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

	async function loadDeliveredOrders() {
		setLoadingDeliveredOrders(true);
		setMessage('');
		if (!apiUrl || !id || !token) {
			setLoadingDeliveredOrders(false);
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${id}/orders/delivered`, {
				headers: { 'Authorization': `Bearer ${token}` }
			});
			const data = response.data;
			const orders = data.items || [];
			setDeliveredOrders(orders);
			
			// If only one order, automatically select it
			if (orders.length === 1) {
				setSelectedOrderId(orders[0].orderId);
				loadFinalImagesForOrder(orders[0].orderId);
			} else if (orders.length > 1) {
				// Multiple orders - show list view
				setSelectedOrderId(null);
			}
		} catch (error) {
			setMessage(formatApiError(error));
			setDeliveredOrders([]);
		} finally {
			setLoadingDeliveredOrders(false);
		}
	}

	async function loadFinalImagesForOrder(orderId) {
		setLoadingFinalImages(true);
		setMessage('');
		if (!apiUrl || !id || !token || !orderId) {
			setMessage('Not authenticated');
			setLoadingFinalImages(false);
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${id}/orders/${orderId}/final/images`, {
				headers: { 'Authorization': `Bearer ${token}` }
			});
			const data = response.data;
			setFinalImages(data.images || []);
			if (data.images && data.images.length === 0) {
				setMessage('No processed photos available for this order.');
			}
		} catch (error) {
			setMessage(formatApiError(error));
			setFinalImages([]);
		} finally {
			setLoadingFinalImages(false);
		}
	}


	async function downloadFinalZip(orderId) {
		setDownloadingFinalZip(true);
		setMessage('');
		if (!apiUrl || !id || !token) {
			setMessage('Not authenticated');
			setDownloadingFinalZip(false);
			return;
		}
		const targetOrderId = orderId || selectedOrderId;
		if (!targetOrderId) {
			setMessage('Order ID required');
			setDownloadingFinalZip(false);
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${id}/orders/${targetOrderId}/final/zip`, {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${token}` }
			});
			const data = response.data;
			if (data.zip) {
				// ZIP is returned as base64-encoded data
				const zipBlob = Uint8Array.from(atob(data.zip), c => c.charCodeAt(0));
				const blob = new Blob([zipBlob], { type: 'application/zip' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = data.filename || `gallery-${id}-order-${targetOrderId}-final.zip`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				setMessage('Download started');
			} else if (data.url) {
				// Fallback to presigned URL (backward compatibility)
				window.open(data.url, '_blank');
				setMessage('Download started');
			} else {
				setMessage('No download data returned');
			}
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setDownloadingFinalZip(false);
		}
	}

	async function deletePhoto(filename) {
		if (!confirm(`Are you sure you want to delete "${filename}"? This will permanently delete the photo from originals, previews, and thumbnails.`)) {
			return;
		}
		setMessage('');
		if (!apiUrl || !id || !token) {
			setMessage('Not authenticated');
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${id}/photos/${encodeURIComponent(filename)}`, {
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

	// Load final images when switching to processed view or when order changes
	useEffect(() => {
		if (viewMode === 'processed' && apiUrl && id && token && selectedOrderId) {
			loadFinalImagesForOrder(selectedOrderId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewMode, apiUrl, id, token, selectedOrderId]);

	// Simplified flags from backend
	const canSelect = galleryInfo?.canSelect !== false; // Can select if no order or order is CLIENT_SELECTING
	const isApproved = galleryInfo?.approved || false;
	const changeRequestPending = galleryInfo?.changeRequestPending || false;
	const hasClientApprovedOrder = galleryInfo?.hasClientApprovedOrder || false;
	const canRequestChange = hasClientApprovedOrder && !changeRequestPending; // Can request changes if approved and not already pending 
	
	// If there are no photos to select from, no active orders, but there are delivered orders, only show processed view
	// (all photos have been bought and delivered, nothing left to purchase)
	const hasNoPhotosToSelect = images.length === 0;
	const hasNoActiveOrders = !canSelect && !hasClientApprovedOrder; // No CLIENT_SELECTING or CLIENT_APPROVED orders
	const shouldShowOnlyProcessed = hasNoPhotosToSelect && hasNoActiveOrders && galleryInfo?.hasDeliveredOrder;
	
	// Force viewMode to 'processed' if there's nothing to purchase
	useEffect(() => {
		if (shouldShowOnlyProcessed && viewMode === 'purchase') {
			setViewMode('processed');
		}
	}, [shouldShowOnlyProcessed, viewMode]);
	
	// Calculate overage in real-time
	const pricingPackage = galleryInfo?.pricingPackage || { includedCount: 0, extraPriceCents: 0 };
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
		if (id) {
			localStorage.removeItem(`gallery_token_${id}`);
			localStorage.removeItem(`gallery_name_${id}`);
		}
		router.replace(`/gallery/login?id=${id}`);
	}

	if (checkingAuth) {
		return (
			<div style={{ padding: 24, textAlign: 'center' }}>
				<div>Loading...</div>
			</div>
		);
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
					{/* View Mode Toggle - Only show if there's a DELIVERED order AND there are photos to select from */}
					{galleryInfo?.hasDeliveredOrder && !shouldShowOnlyProcessed && (
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
				<div>
					{/* Order List View - Show when multiple orders exist and no order is selected */}
					{deliveredOrders.length > 1 && !selectedOrderId && (
						<div>
							<div style={{ marginBottom: 16, padding: 16, background: '#e8f4f8', borderRadius: 8 }}>
								<h2 style={{ marginTop: 0 }}>Processed Photos</h2>
								<p style={{ color: '#666', marginBottom: 16 }}>
									You have {deliveredOrders.length} delivered orders. Select an order to view and download photos.
								</p>
							</div>
							{loadingDeliveredOrders ? (
								<div style={{ textAlign: 'center', padding: 40 }}>
									<div>Loading orders...</div>
								</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
									{deliveredOrders.map((order) => (
										<div
											key={order.orderId}
											onClick={() => {
												setSelectedOrderId(order.orderId);
												loadFinalImagesForOrder(order.orderId);
											}}
											style={{
												padding: 16,
												border: '2px solid #ddd',
												borderRadius: 8,
												cursor: 'pointer',
												background: 'white',
												transition: 'all 0.2s',
												boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.borderColor = '#0066cc';
												e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.borderColor = '#ddd';
												e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
											}}
										>
											<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
												<div>
													<h3 style={{ margin: 0, marginBottom: 4 }}>Order #{order.orderNumber || order.orderId}</h3>
													<p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
														Delivered: {new Date(order.deliveredAt || order.createdAt).toLocaleDateString()}
													</p>
													<p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
														{order.imageCount || order.selectedCount || 0} photos
													</p>
												</div>
												<button
													onClick={(e) => {
														e.stopPropagation();
														downloadFinalZip(order.orderId);
													}}
													disabled={downloadingFinalZip}
													style={{
														padding: '8px 16px',
														fontSize: '14px',
														fontWeight: 'bold',
														background: downloadingFinalZip ? '#ccc' : '#28a745',
														color: 'white',
														border: 'none',
														borderRadius: 4,
														cursor: downloadingFinalZip ? 'not-allowed' : 'pointer'
													}}
												>
													{downloadingFinalZip ? 'Generating...' : 'Download ZIP'}
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Order Gallery View - Show when an order is selected or only one order exists */}
					{(selectedOrderId || deliveredOrders.length === 1) && (
						<div>
							{/* Order Navigation Header */}
							{deliveredOrders.length > 1 && (
								<div style={{ marginBottom: 16, padding: 16, background: '#f0f0f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									<div>
										<button
											onClick={() => setSelectedOrderId(null)}
											style={{
												padding: '8px 16px',
												fontSize: '14px',
												background: '#6c757d',
												color: 'white',
												border: 'none',
												borderRadius: 4,
												cursor: 'pointer',
												marginRight: 12
											}}
										>
											← Back to Orders
										</button>
										<span style={{ fontSize: '16px', fontWeight: 'bold' }}>
											Order #{deliveredOrders.find(o => o.orderId === selectedOrderId)?.orderNumber || selectedOrderId}
										</span>
									</div>
									<div style={{ display: 'flex', gap: 8 }}>
										{(() => {
											const currentIndex = deliveredOrders.findIndex(o => o.orderId === selectedOrderId);
											const prevOrder = currentIndex > 0 ? deliveredOrders[currentIndex - 1] : null;
											const nextOrder = currentIndex < deliveredOrders.length - 1 ? deliveredOrders[currentIndex + 1] : null;
											return (
												<>
													{prevOrder && (
														<button
															onClick={() => {
																setSelectedOrderId(prevOrder.orderId);
																loadFinalImagesForOrder(prevOrder.orderId);
															}}
															style={{
																padding: '8px 16px',
																fontSize: '14px',
																background: '#007bff',
																color: 'white',
																border: 'none',
																borderRadius: 4,
																cursor: 'pointer'
															}}
														>
															← Previous Order
														</button>
													)}
													{nextOrder && (
														<button
															onClick={() => {
																setSelectedOrderId(nextOrder.orderId);
																loadFinalImagesForOrder(nextOrder.orderId);
															}}
															style={{
																padding: '8px 16px',
																fontSize: '14px',
																background: '#007bff',
																color: 'white',
																border: 'none',
																borderRadius: 4,
																cursor: 'pointer'
															}}
														>
															Next Order →
														</button>
													)}
												</>
											);
										})()}
									</div>
								</div>
							)}
							
							<div style={{ marginBottom: 16, padding: 16, background: '#e8f4f8', borderRadius: 8 }}>
								<h2 style={{ marginTop: 0 }}>Processed Photos</h2>
								<p style={{ color: '#666', marginBottom: 16 }}>
									Download your processed photos individually (right-click and save) or as a ZIP file.
								</p>
								{finalImages.length > 0 && (
									<button
										onClick={() => downloadFinalZip(selectedOrderId || deliveredOrders[0]?.orderId)}
										disabled={downloadingFinalZip}
										style={{
											padding: '12px 24px',
											fontSize: '16px',
											fontWeight: 'bold',
											background: downloadingFinalZip ? '#ccc' : '#28a745',
											color: 'white',
											border: 'none',
											borderRadius: 4,
											cursor: downloadingFinalZip ? 'not-allowed' : 'pointer',
											marginBottom: 16
										}}
									>
										{downloadingFinalZip ? 'Generating ZIP...' : `Download All as ZIP (${finalImages.length} photos)`}
									</button>
								)}
							</div>
							{loadingFinalImages ? (
								<div style={{ textAlign: 'center', padding: 40 }}>
									<div>Loading processed photos...</div>
								</div>
							) : finalImages.length > 0 ? (
								<div>
									<h2>Processed Photos ({finalImages.length})</h2>
									<div style={{ 
										display: 'grid', 
										gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
										gap: 16,
										marginTop: 16
									}}>
										{finalImages.map((img, index) => (
											<div
												key={img.key}
												style={{
													position: 'relative',
													cursor: 'pointer',
													border: '2px solid #ddd',
													borderRadius: 8,
													overflow: 'hidden',
													background: '#f0f0f0',
													transition: 'all 0.2s',
													boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
												}}
												onClick={() => {
													// Find index in finalImages for modal
													setModalImageIndex(index);
												}}
											>
												{img.finalUrl ? (
													<img 
														src={img.finalUrl} 
														alt={img.key}
														style={{ 
															width: '100%', 
															height: '250px', 
															objectFit: 'cover',
															display: 'block'
														}}
													/>
												) : (
													<div style={{ width: '100%', height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
														No preview
													</div>
												)}
												<div style={{
													position: 'absolute',
													bottom: 0,
													left: 0,
													right: 0,
													background: 'rgba(0,0,0,0.7)',
													color: 'white',
													padding: 8,
													fontSize: '12px',
													textAlign: 'center'
												}}>
													{img.key}
												</div>
											</div>
										))}
									</div>
								</div>
							) : (
								<div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
									No processed photos available yet. The photographer will upload them after processing your selection.
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Purchase Additional Photos View */}
			{viewMode === 'purchase' && (
				<div>
					{/* Status & Actions */}
					<div style={{ marginBottom: 16, padding: 16, background: '#e8f4f8', borderRadius: 8 }}>
							<div style={{ marginBottom: 8 }}>
								<strong>Status:</strong>{' '}
								{changeRequestPending ? (
									<span style={{ color: '#ff9900', fontWeight: 'bold' }}>⏳ Change Request Pending</span>
								) : isApproved ? (
									<span style={{ color: '#0066cc', fontWeight: 'bold' }}>✓ Approved</span>
								) : canSelect ? (
									<span style={{ color: '#00aa00' }}>✓ Selection Active</span>
								) : (
									<span style={{ color: '#cc6600' }}>🔒 Selection Locked</span>
								)}
							</div>
							<div style={{ marginBottom: 8 }}>
								<strong>Selected:</strong> {currentSelectedCount} photos
								{!isPurchaseMore && includedCount > 0 && (
									<span> ({includedCount} included in package)</span>
								)}
								{isPurchaseMore && (
									<span style={{ color: '#666', fontSize: '14px' }}> (each photo costs extra)</span>
								)}
								{includedCount === 0 && extraPriceCents === 0 && currentSelectedCount > 0 && !isPurchaseMore && (
									<span style={{ color: '#666', fontSize: '14px' }}> (pricing not configured)</span>
								)}
								{galleryInfo && galleryInfo.selectedCount > 0 && galleryInfo.selectedCount !== currentSelectedCount && (
									<span style={{ color: '#666', fontSize: '14px' }}> ({galleryInfo.selectedCount} saved)</span>
								)}
							</div>
							{minSelectionRequired > 0 && !meetsMinimumSelection && (
								<div style={{ marginBottom: 8, color: '#cc6600', fontWeight: 'bold' }}>
									⚠️ Please select at least {minSelectionRequired} photo{minSelectionRequired !== 1 ? 's' : ''} (minimum required by package)
								</div>
							)}
							{currentOverageCount > 0 && extraPriceCents > 0 && (
								<div style={{ marginBottom: 8, color: '#cc6600' }}>
									<strong>Additional payment:</strong> {currentOverageCount} extra photo{currentOverageCount !== 1 ? 's' : ''} = {(currentOverageCents / 100).toFixed(2)} PLN
								</div>
							)}
							{currentOverageCount > 0 && extraPriceCents === 0 && (
								<div style={{ marginBottom: 8, color: '#666' }}>
									{currentOverageCount} extra photo{currentOverageCount !== 1 ? 's' : ''} selected (no additional charge)
								</div>
							)}
							{currentSelectedCount > 0 && currentOverageCount === 0 && includedCount > 0 && !isPurchaseMore && (
								<div style={{ marginBottom: 8, color: '#00aa00' }}>
									✓ All selected photos are included in your package
								</div>
							)}
							{isPurchaseMore && currentSelectedCount > 0 && (
								<div style={{ marginBottom: 8, color: '#cc6600' }}>
									<strong>Total payment:</strong> {currentSelectedCount} photo{currentSelectedCount !== 1 ? 's' : ''} × {(extraPriceCents / 100).toFixed(2)} PLN = {(currentOverageCents / 100).toFixed(2)} PLN
								</div>
							)}
							<div style={{ marginTop: 12 }}>
								{canSelect && (
									<button 
										onClick={approveSelection} 
										disabled={selectedKeys.size === 0 || saving || !meetsMinimumSelection}
										style={{ marginRight: 8, padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', background: (selectedKeys.size === 0 || saving || !meetsMinimumSelection) ? '#ccc' : '#0066cc', color: 'white', border: 'none', borderRadius: 4, cursor: (selectedKeys.size === 0 || saving || !meetsMinimumSelection) ? 'not-allowed' : 'pointer' }}
									>
										{saving ? 'Approving...' : (isPurchaseMore ? 'Approve Additional Selection' : 'Approve Selection')} ({selectedKeys.size} photos)
									</button>
								)}
								{canRequestChange && (
									<button 
										onClick={requestChange}
										disabled={saving}
										style={{ padding: '12px 24px', fontSize: '16px', background: '#ff9900', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
									>
										Request Changes
									</button>
								)}
								{changeRequestPending && (
									<div style={{ padding: '12px 16px', fontSize: '14px', background: '#fff3cd', color: '#856404', border: '1px solid #ffc107', borderRadius: 4 }}>
										⏳ Change request submitted. Waiting for photographer to approve your request.
									</div>
								)}
								{saving && <span style={{ marginLeft: 8, color: '#666', fontSize: '14px' }}>💾 Approving...</span>}
							</div>
						</div>

					{/* Image Grid */}
					{images.length > 0 && (
						<div>
							<h2>Photos ({images.length})</h2>
							<div style={{ 
								display: 'grid', 
								gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
								gap: 16,
								marginTop: 16
							}}>
								{images.map((img, index) => {
									const isSelected = selectedKeys.has(img.key);
									return (
										<div
											key={img.key}
											style={{
												position: 'relative',
												cursor: 'pointer',
												border: isSelected ? '4px solid #ff0066' : '2px solid #ddd',
												borderRadius: 8,
												overflow: 'hidden',
												background: isSelected ? '#ffe6f0' : '#f0f0f0',
												opacity: isSelected ? 1 : (canSelect ? 1 : 0.7),
												transition: 'all 0.2s',
												boxShadow: isSelected ? '0 4px 12px rgba(255,0,102,0.4)' : '0 2px 4px rgba(0,0,0,0.1)'
											}}
										>
											<div 
												onClick={() => {
													if (canSelect) {
														toggleImage(img.key);
													} else {
														openModal(index);
													}
												}}
												onDoubleClick={() => openModal(index)}
												style={{ position: 'relative' }}
											>
												{img.previewUrl ? (
													<img 
														src={img.previewUrl} 
														alt={img.key}
														style={{ 
															width: '100%', 
															height: '250px', 
															objectFit: 'cover',
															display: 'block'
														}}
													/>
												) : (
													<div style={{ width: '100%', height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
														No preview
													</div>
												)}
												{/* Heart icon overlay - only show on selected photos */}
												{isSelected && (
													<div
														onClick={(e) => {
															e.stopPropagation();
															if (canSelect) {
																toggleImage(img.key);
															}
														}}
														style={{
															position: 'absolute',
															top: 8,
															right: 8,
															background: '#ff0066',
															color: 'white',
															borderRadius: '50%',
															width: 36,
															height: 36,
															display: 'flex',
															alignItems: 'center',
															justifyContent: 'center',
															cursor: canSelect ? 'pointer' : 'default',
															fontSize: '20px',
															boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
															transition: 'all 0.2s',
															zIndex: 10
														}}
													>
														❤️
													</div>
												)}
												{/* Delete button - show for owner (backend will handle authorization) */}
												<button
													onClick={(e) => {
														e.stopPropagation();
														deletePhoto(img.key);
													}}
													style={{
														position: 'absolute',
														top: 8,
														left: 8,
														background: 'rgba(220, 53, 69, 0.9)',
														color: 'white',
														border: 'none',
														borderRadius: '50%',
														width: 32,
														height: 32,
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'center',
														cursor: 'pointer',
														fontSize: '16px',
														boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
														zIndex: 10,
														transition: 'all 0.2s'
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.background = 'rgba(220, 53, 69, 1)';
														e.currentTarget.style.transform = 'scale(1.1)';
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.background = 'rgba(220, 53, 69, 0.9)';
														e.currentTarget.style.transform = 'scale(1)';
													}}
													title="Delete photo"
												>
													🗑️
												</button>
											</div>
											<div style={{ 
											padding: 8, 
											fontSize: '12px', 
											color: '#666',
											textOverflow: 'ellipsis',
											overflow: 'hidden',
											whiteSpace: 'nowrap'
										}}>
											{img.key}
										</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{images.length === 0 && !loading && apiUrl && id && token && (
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
				<div
					onClick={closeModal}
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: 'rgba(0, 0, 0, 0.95)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1000,
						cursor: 'pointer'
					}}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							position: 'relative',
							maxWidth: '90vw',
							maxHeight: '90vh',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center'
						}}
					>
						{/* Close button */}
						<button
							onClick={closeModal}
							style={{
								position: 'absolute',
								top: 20,
								right: 20,
								background: 'rgba(255, 255, 255, 0.9)',
								border: 'none',
								borderRadius: '50%',
								width: 40,
								height: 40,
								fontSize: '24px',
								cursor: 'pointer',
								zIndex: 1001,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
							}}
						>
							×
						</button>

						{/* Heart icon for selection - only show on selected photos in purchase view */}
						{viewMode === 'purchase' && selectedKeys.has(currentImage.key) && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									if (canSelect) {
										toggleImage(currentImage.key);
									}
								}}
								style={{
									position: 'absolute',
									top: 20,
									right: 70,
									background: '#ff0066',
									color: 'white',
									border: 'none',
									borderRadius: '50%',
									width: 40,
									height: 40,
									fontSize: '24px',
									cursor: canSelect ? 'pointer' : 'default',
									zIndex: 1001,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
									transition: 'all 0.2s',
									opacity: canSelect ? 1 : 0.8
								}}
							>
								❤️
							</button>
						)}

						{/* Previous button */}
						{currentImages.length > 1 && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									navigateModal('prev');
								}}
								style={{
									position: 'absolute',
									left: 20,
									background: 'rgba(255, 255, 255, 0.9)',
									border: 'none',
									borderRadius: '50%',
									width: 50,
									height: 50,
									fontSize: '28px',
									cursor: 'pointer',
									zIndex: 1001,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
								}}
							>
								‹
							</button>
						)}

						{/* Image */}
						{(viewMode === 'processed' ? currentImage.finalUrl : currentImage.previewUrl) ? (
							<img
								src={viewMode === 'processed' ? currentImage.finalUrl : currentImage.previewUrl}
								alt={currentImage.key}
								onContextMenu={(e) => {
									// Allow right-click save on processed photos
									if (viewMode === 'processed') {
										e.preventDefault();
										const link = document.createElement('a');
										link.href = currentImage.finalUrl;
										link.download = currentImage.key;
										document.body.appendChild(link);
										link.click();
										document.body.removeChild(link);
									}
								}}
								style={{
									maxWidth: '90vw',
									maxHeight: '90vh',
									objectFit: 'contain',
									borderRadius: 8,
									boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
								}}
							/>
						) : (
							<div style={{ color: 'white', fontSize: '18px' }}>
								No preview available
							</div>
						)}

						{/* Next button */}
						{currentImages.length > 1 && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									navigateModal('next');
								}}
								style={{
									position: 'absolute',
									right: 20,
									background: 'rgba(255, 255, 255, 0.9)',
									border: 'none',
									borderRadius: '50%',
									width: 50,
									height: 50,
									fontSize: '28px',
									cursor: 'pointer',
									zIndex: 1001,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
								}}
							>
								›
							</button>
						)}

						{/* Image counter */}
						<div
							style={{
								position: 'absolute',
								bottom: 20,
								left: '50%',
								transform: 'translateX(-50%)',
								background: 'rgba(0, 0, 0, 0.7)',
								color: 'white',
								padding: '8px 16px',
								borderRadius: 20,
								fontSize: '14px',
								zIndex: 1001
							}}
						>
							{modalImageIndex + 1} / {currentImages.length}
						</div>
					</div>
				</div>
				);
			})()}
		</div>
	);
}
