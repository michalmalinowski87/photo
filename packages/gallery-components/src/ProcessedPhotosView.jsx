import React, { useState, useEffect, useRef } from 'react';
import { getInitialImageUrl, getNextFallbackUrl } from './imageFallback';

// Image item component with fallback support
// Uses shared fallback strategy from imageFallback.js
function ProcessedImageItem({ img, index, onImageClick }) {
	const initialSrc = getInitialImageUrl(img, 'bigthumb');
	const [currentSrc, setCurrentSrc] = useState(initialSrc);
	const fallbackAttemptsRef = useRef(new Set());
	const attemptedSizesRef = useRef(new Set());

	useEffect(() => {
		const newSrc = getInitialImageUrl(img, 'bigthumb');
		setCurrentSrc(newSrc);
		fallbackAttemptsRef.current.clear();
		attemptedSizesRef.current.clear();
		attemptedSizesRef.current.add('bigthumb');
	}, [img]);

	const handleError = (e) => {
		const failedUrl = e.currentTarget.src;
		
		// Determine which size failed based on URL
		const getSizeFromUrl = (url) => {
			const normalized = url.split('?')[0]; // Remove query params
			if (normalized.includes('/thumbs/')) return 'thumb';
			if (normalized.includes('/previews/')) return 'preview';
			if (normalized.includes('/bigthumbs/')) return 'bigthumb';
			return null;
		};
		
		const failedSize = getSizeFromUrl(failedUrl);
		if (failedSize) {
			attemptedSizesRef.current.add(failedSize);
		}
		
		if (fallbackAttemptsRef.current.has(failedUrl)) {
			return;
		}
		fallbackAttemptsRef.current.add(failedUrl);

		const nextUrl = getNextFallbackUrl(failedUrl, img, attemptedSizesRef.current, 'bigthumb');
		if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
			// Mark the size of the next URL as attempted
			const nextSize = getSizeFromUrl(nextUrl);
			if (nextSize) {
				attemptedSizesRef.current.add(nextSize);
			}
			setCurrentSrc(nextUrl);
			return;
		}
	};

	return (
		<div
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
			onClick={() => onImageClick && onImageClick(index)}
		>
			{currentSrc ? (
				<img 
					src={currentSrc} 
					alt={img.key}
					onError={handleError}
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
			}} title={img.key}>
				{(() => {
					// Remove file extension for display
					const filename = img.key || '';
					const lastDot = filename.lastIndexOf('.');
					return lastDot === -1 ? filename : filename.substring(0, lastDot);
				})()}
			</div>
		</div>
	);
}

export default function ProcessedPhotosView({
	galleryId,
	token,
	apiUrl,
	onImageClick,
	apiFetch,
	onFinalImagesChange
}) {
	const [deliveredOrders, setDeliveredOrders] = useState([]);
	const [selectedOrderId, setSelectedOrderId] = useState(null);
	const [finalImages, setFinalImages] = useState([]);
	const [loadingDeliveredOrders, setLoadingDeliveredOrders] = useState(false);
	const [loadingFinalImages, setLoadingFinalImages] = useState(false);
	const [downloadingFinalZip, setDownloadingFinalZip] = useState(false);

	useEffect(() => {
		if (galleryId && token && apiUrl) {
			loadDeliveredOrders();
		}
	}, [galleryId, token, apiUrl]);

	useEffect(() => {
		if (selectedOrderId && galleryId && token && apiUrl) {
			loadFinalImagesForOrder(selectedOrderId);
		}
	}, [selectedOrderId, galleryId, token, apiUrl]);

	async function loadDeliveredOrders() {
		setLoadingDeliveredOrders(true);
		try {
			if (apiFetch) {
				const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/delivered`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const orders = response.data.items || [];
				setDeliveredOrders(orders);
				
				// If only one order, automatically select it
				if (orders.length === 1) {
					setSelectedOrderId(orders[0].orderId);
				}
			} else {
				const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/delivered`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const data = await response.json();
				const orders = data.items || [];
				setDeliveredOrders(orders);
				
				if (orders.length === 1) {
					setSelectedOrderId(orders[0].orderId);
				}
			}
		} catch (error) {
			console.error('Failed to load delivered orders:', error);
			setDeliveredOrders([]);
		} finally {
			setLoadingDeliveredOrders(false);
		}
	}

	async function loadFinalImagesForOrder(orderId) {
		setLoadingFinalImages(true);
		try {
			if (apiFetch) {
				const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const images = response.data.images || [];
				setFinalImages(images);
				if (onFinalImagesChange) {
					onFinalImagesChange(images);
				}
			} else {
				const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const data = await response.json();
				const images = data.images || [];
				setFinalImages(images);
				if (onFinalImagesChange) {
					onFinalImagesChange(images);
				}
			}
		} catch (error) {
			console.error('Failed to load final images:', error);
			setFinalImages([]);
		} finally {
			setLoadingFinalImages(false);
		}
	}

	async function downloadFinalZip(orderId) {
		setDownloadingFinalZip(true);
		try {
			if (apiFetch) {
				const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`, {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const zipData = response.data;
				
				if (!zipData.url) {
					throw new Error('No ZIP URL available');
				}

				const filename = zipData.filename || `gallery-${galleryId}-order-${orderId}-final.zip`;
				const a = document.createElement('a');
				a.href = zipData.url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			} else {
				const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`, {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const data = await response.json();
				
				if (!data.url) {
					throw new Error('No ZIP URL available');
				}

				const filename = data.filename || `gallery-${galleryId}-order-${orderId}-final.zip`;
				const a = document.createElement('a');
				a.href = data.url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			}
		} catch (error) {
			console.error('Failed to download ZIP:', error);
		} finally {
			setDownloadingFinalZip(false);
		}
	}

	if (deliveredOrders.length === 0 && !loadingDeliveredOrders) {
		return (
			<div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
				No processed photos available yet. The photographer will upload them after processing your selection.
			</div>
		);
	}

	return (
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
									onClick={() => setSelectedOrderId(order.orderId)}
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
													onClick={() => setSelectedOrderId(prevOrder.orderId)}
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
													onClick={() => setSelectedOrderId(nextOrder.orderId)}
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
									<ProcessedImageItem
										key={img.key}
										img={img}
										index={index}
										onImageClick={onImageClick}
									/>
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
	);
}

