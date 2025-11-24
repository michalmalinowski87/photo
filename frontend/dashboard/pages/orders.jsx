import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../lib/api';
import { initAuth, getIdToken, signOut, redirectToCognito, getHostedUILogoutUrl } from '../lib/auth';

export default function Orders() {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState('');
	const [galleryId, setGalleryId] = useState('');
	const [idToken, setIdToken] = useState('');
	const [orders, setOrders] = useState([]);
	const [gallery, setGallery] = useState(null);
	const [message, setMessage] = useState('');
	const [downloadingZip, setDownloadingZip] = useState({});
	const [generatingZip, setGeneratingZip] = useState({});
	const [uploadingFinal, setUploadingFinal] = useState({});
	const [finalFiles, setFinalFiles] = useState({});

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
		
		// Initialize auth with token sharing
		const { initializeAuth, redirectToLandingSignIn } = require('../lib/auth-init');
		initializeAuth(
			(token) => {
				setIdToken(token);
			},
			() => {
				// No token found, redirect to landing sign-in
				redirectToLandingSignIn(router.asPath);
			}
		);
	}, [router]);

	async function loadOrders() {
		setMessage('');
		if (!apiUrl || !galleryId || !idToken) {
			setMessage('Need API URL, Gallery ID and ID Token');
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			
			// Handle case where response.data might be a JSON string
			let parsedData = response.data;
			if (typeof parsedData === 'string') {
				try {
					parsedData = JSON.parse(parsedData);
				} catch (e) {
					setMessage(`Failed to parse response: ${e.message}`);
					setOrders([]);
					return;
				}
			}
			
			// Extract items array and gallery metadata
			const ordersData = parsedData?.items;
			const galleryData = parsedData?.gallery;
			
			if (Array.isArray(ordersData)) {
				setOrders(ordersData);
				setGallery(galleryData || null);
				if (ordersData.length === 0) {
					setMessage('No orders found for this gallery');
				} else {
					setMessage(`Loaded ${ordersData.length} order(s)`);
				}
			} else {
				setMessage(`Unexpected response format. Expected items array, got: ${typeof ordersData}`);
				setOrders([]);
			}
		} catch (error) {
			setMessage(formatApiError(error));
			setOrders([]);
		}
	}

	async function approveChange(orderId) {
		setMessage('');
		if (!orderId) {
			setMessage('Order ID required');
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/approve-change`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${idToken}` }
		});
		setMessage('Change request approved - selection unlocked');
		await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function generateZip(orderId) {
		setMessage('');
		setGeneratingZip({ [orderId]: true });
		try {
			// Step 1: Generate ZIP (returns JSON only, no file)
			const generateResponse = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/generate-zip`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			
			if (!generateResponse.ok) {
				const errorData = await generateResponse.json().catch(() => ({ error: 'Failed to generate ZIP' }));
				setMessage(formatApiError(errorData));
				return;
			}
			
			const generateData = await generateResponse.json();
			if (!generateData.zipKey) {
					setMessage('ZIP generation completed but no zipKey returned');
				return;
			}
			
			// Step 2: Download ZIP via Download ZIP endpoint
			// This endpoint handles serving the file and deletion (if no backup addon)
			setMessage('ZIP generated successfully. Downloading...');
			await downloadZip(orderId);
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setGeneratingZip({});
		}
	}

	// Helper function to check if order has backup storage addon
	// For now, we'll check if order has hasBackupStorage field or check via API
	async function checkHasBackupAddon(orderId) {
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			// Check if order has addon info - we'll add this to order data later
			// For now, assume no addon if not explicitly set
			return data.hasBackupStorage === true;
		} catch (error) {
			// If we can't check, assume no addon to be safe
			return false;
		}
	}

	async function downloadZip(orderId) {
		setMessage('');
		setDownloadingZip({ [orderId]: true });
		try {
			const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`, {
				method: 'GET',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			
			if (response.headers.get('content-type')?.includes('application/zip')) {
				// Binary ZIP response - trigger download
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${orderId}.zip`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				
				// Check if it's one-time use from response headers or try to get from JSON
				const oneTimeUse = response.headers.get('x-one-time-use') === 'true';
				setMessage(`Download started for order ${orderId}${oneTimeUse ? ' (one-time use)' : ''}`);
				await loadOrders(); // Reload to refresh order state
			} else {
				// JSON response (fallback or error)
				const data = await response.json();
				if (data.error) {
					setMessage(`Error: ${data.error}`);
				} else {
					setMessage('No ZIP file available');
				}
			}
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setDownloadingZip({});
		}
	}

	async function markAsPaid(orderId) {
		setMessage('');
		if (!window.confirm('Mark this order as paid? This should only be done if payment was received outside the system.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-paid`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Order marked as paid');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function markAsCanceled(orderId) {
		setMessage('');
		// Note: In production, use a confirmation modal instead of window.confirm
		if (!confirm('Oznaczyć to zlecenie jako anulowane? Ta akcja nie może być cofnięta.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-canceled`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Zlecenie oznaczone jako anulowane');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function markAsRefunded(orderId) {
		setMessage('');
		// Note: In production, use a confirmation modal instead of window.confirm
		if (!confirm('Oznaczyć to zlecenie jako zwrócone? To powinno być wykonane tylko jeśli zwrot został przetworzony poza systemem.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-refunded`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Zlecenie oznaczone jako zwrócone');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function markAsPartiallyPaid(orderId) {
		setMessage('');
		// Note: In production, use a confirmation modal instead of window.confirm
		if (!confirm('Oznaczyć to zlecenie jako częściowo opłacone? To powinno być wykonane tylko jeśli wpłata została otrzymana poza systemem.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-partially-paid`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Zlecenie oznaczone jako częściowo opłacone');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function processedComplete(orderId) {
		setMessage('');
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/processed/complete`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ orderId })
		});
		setMessage('Order marked delivered and originals cleaned');
		await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function sendFinalLink(orderId) {
		setMessage('');
		if (!orderId) {
			setMessage('Order ID required');
			return;
		}
		try {
			const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/send-final-link`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			const data = response.data;
			if (data && data.deliveryStatus === 'DELIVERED') {
				setMessage(`Final link sent to client. Order marked as DELIVERED.`);
			} else {
				setMessage('Final link sent to client');
			}
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function uploadFinalPhotos(orderId) {
		if (!finalFiles[orderId] || finalFiles[orderId].length === 0) {
			setMessage('Please select files to upload');
			return;
		}
		
		// Find the order to check its current status
		const order = orders.find((o) => o.orderId === orderId);
		const currentStatus = order?.deliveryStatus;
		
		// Check if gallery has backup addon and selection enabled from gallery metadata
		const hasBackup = gallery?.hasBackupStorage === true;
		const selectionEnabled = gallery?.selectionEnabled !== false;
		
		// Show warning if no backup addon AND selection is enabled AND status will change from CLIENT_APPROVED to PREPARING_DELIVERY
		// Don't show warning if selection is disabled (non-selection galleries) or order is already PREPARING_DELIVERY
		if (!hasBackup && selectionEnabled && currentStatus === 'CLIENT_APPROVED') {
			const warning = 'Warning: Once you upload final photos, the status will change to PREPARING_DELIVERY and you will no longer be able to generate the originals ZIP. Original photos will be permanently removed after delivery.\n\nYou can purchase the backup storage addon from the gallery list page.';
			if (!window.confirm(warning + '\n\nDo you want to continue with upload?')) {
				return;
			}
		}
		
		setUploadingFinal({ ...uploadingFinal, [orderId]: true });
		setMessage('');
		try {
			const files = finalFiles[orderId];
			for (const file of files) {
				const fileName = file.name;
				// Get presigned URL
				const { data: pr } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/upload`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
					body: JSON.stringify({ key: fileName, contentType: file.type || 'application/octet-stream' })
				});
				// Upload file
				await new Promise((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.addEventListener('load', () => {
						if (xhr.status >= 200 && xhr.status < 300) {
							resolve();
						} else {
							reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
						}
					});
					xhr.addEventListener('error', () => reject(new Error('Upload failed')));
					xhr.open('PUT', pr.url);
					xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
					xhr.send(file);
				});
			}
			setMessage(`Uploaded ${files.length} file(s) successfully`);
			setFinalFiles({ ...finalFiles, [orderId]: [] });
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setUploadingFinal({ ...uploadingFinal, [orderId]: false });
		}
	}

	const handleLogout = async () => {
		// Clear all tokens and session data on dashboard domain
		signOut();
		setIdToken('');
		
		// Redirect to Cognito logout endpoint to clear server-side session cookies
		// After logout, redirect to landing main page
		const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
		const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:3003';
		const logoutRedirectUrl = landingUrl; // Redirect to main landing page, not logout-callback
		
		if (userPoolDomain) {
			// Use helper function to build Cognito logout URL
			const logoutUrl = getHostedUILogoutUrl(userPoolDomain, logoutRedirectUrl);
			window.location.href = logoutUrl;
		} else {
			// Fallback: redirect directly to landing main page
			window.location.href = logoutRedirectUrl;
		}
	};

	return (
		<div style={{ padding: 24, maxWidth: '100%', boxSizing: 'border-box' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ margin: 0 }}>Orders</h1>
				{idToken && <button onClick={handleLogout} style={{ padding: '8px 16px' }}>Logout</button>}
			</div>
			
			{/* Configuration - Only show if not auto-configured */}
			{(!process.env.NEXT_PUBLIC_API_URL || !idToken) && (
				<div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
					<div style={{ marginBottom: 8 }}>
						<label>API URL </label>
						<input style={{ width: '100%', maxWidth: 420 }} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
					</div>
					<div style={{ marginBottom: 8 }}>
						<label>ID Token </label>
						<input style={{ width: '100%', maxWidth: 420 }} value={idToken} onChange={(e) => setIdToken(e.target.value)} placeholder="Auto-filled if logged in" />
					</div>
				</div>
			)}
			
			<div style={{ marginBottom: 16 }}>
				<div style={{ marginBottom: 8 }}>
					<label>Gallery ID </label>
					<input style={{ width: '100%', maxWidth: 420 }} value={galleryId} onChange={(e) => setGalleryId(e.target.value)} />
				</div>
				<button onClick={loadOrders} disabled={!apiUrl || !galleryId || !idToken}>Load Orders</button>
			</div>
			{message ? <p>{message}</p> : null}
			<div style={{ overflowX: 'auto' }}>
				<table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
				<thead>
					<tr>
						<th>OrderId</th>
						<th>Delivery Status</th>
						<th>Payment Status</th>
						<th>Selected</th>
						<th>Overage</th>
						<th>ZIP</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{orders.length === 0 ? (
						<tr>
							<td colSpan="7" style={{ textAlign: 'center', padding: 20, color: '#666' }}>
								No orders found
							</td>
						</tr>
					) : (
						orders.map((o) => (
							<tr key={o.orderId}>
								<td>{o.orderId}</td>
								<td>{o.deliveryStatus || '-'}</td>
								<td>{o.paymentStatus || '-'}</td>
								<td>{o.selectedCount}</td>
								<td>{o.overageCents ? `${(o.overageCents / 100).toFixed(2)} PLN` : '0 PLN'}</td>
								<td>{o.zipKey || '-'}</td>
								<td>
									{/* Generate ZIP button (displaying as Download ZIP) - only show when no backup addon and CLIENT_APPROVED status */}
									{!gallery?.hasBackupStorage && o.deliveryStatus === 'CLIENT_APPROVED' && !o.zipKey && (
										<button 
											onClick={() => generateZip(o.orderId)} 
											disabled={generatingZip[o.orderId]}
											style={{ 
												marginRight: 8, 
												padding: '4px 8px', 
												fontSize: '12px', 
												background: '#17a2b8', 
												color: 'white', 
												border: 'none', 
												borderRadius: 4, 
												cursor: generatingZip[o.orderId] ? 'not-allowed' : 'pointer',
												opacity: generatingZip[o.orderId] ? 0.6 : 1
											}}
											title="Download ZIP file for this order (one-time download available)"
										>
											{generatingZip[o.orderId] ? 'Generating...' : 'Download ZIP'}
										</button>
									)}
									{/* Download ZIP - available when ZIP exists and order is not CANCELLED or DELIVERED */}
									{o.zipKey && o.deliveryStatus !== 'CANCELLED' && o.deliveryStatus !== 'DELIVERED' && (
										<button 
											onClick={() => downloadZip(o.orderId)} 
											disabled={downloadingZip[o.orderId]}
											style={{ 
												marginRight: 8, 
												padding: '4px 8px', 
												fontSize: '12px', 
												background: '#28a745', 
												color: 'white', 
												border: 'none', 
												borderRadius: 4, 
												cursor: 'pointer'
											}}
											title={gallery?.hasBackupStorage ? "Download ZIP file (available for all statuses)" : "Download ZIP file (one-time use)"}
										>
											{downloadingZip[o.orderId] ? 'Downloading...' : 'Download ZIP'}
										</button>
									)}
									{/* Download ZIP for DELIVERED orders with backup addon */}
									{o.zipKey && o.deliveryStatus === 'DELIVERED' && gallery?.hasBackupStorage && (
										<button 
											onClick={() => downloadZip(o.orderId)} 
											disabled={downloadingZip[o.orderId]}
											style={{ 
												marginRight: 8, 
												padding: '4px 8px', 
												fontSize: '12px', 
												background: '#28a745', 
												color: 'white', 
												border: 'none', 
												borderRadius: 4, 
												cursor: 'pointer'
											}}
											title="Download ZIP file (backup storage addon purchased)"
										>
											{downloadingZip[o.orderId] ? 'Downloading...' : 'Download ZIP'}
										</button>
									)}
									{/* Mark as Paid - available for UNPAID orders */}
									{o.paymentStatus === 'UNPAID' && (
										<button 
											onClick={() => markAsPaid(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
										>
											Mark as Paid
										</button>
									)}
									{/* Mark as Deposit Paid - available for UNPAID orders */}
									{o.paymentStatus === 'UNPAID' && (
										<button 
											onClick={() => markAsPartiallyPaid(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
										>
											Mark Deposit Paid
										</button>
									)}
									{/* Mark as Canceled - available for orders that are not CANCELLED or DELIVERED */}
									{o.deliveryStatus !== 'CANCELLED' && o.deliveryStatus !== 'DELIVERED' && (
										<button 
											onClick={() => markAsCanceled(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
										>
											Mark as Canceled
										</button>
									)}
									{/* Mark as Refunded - available for orders with PAID or PARTIALLY_PAID payment status */}
									{(o.paymentStatus === 'PAID' || o.paymentStatus === 'PARTIALLY_PAID') && o.paymentStatus !== 'REFUNDED' && o.deliveryStatus !== 'DELIVERED' && (
										<button 
											onClick={() => markAsRefunded(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#ffc107', color: 'black', border: 'none', borderRadius: 4, cursor: 'pointer' }}
										>
											Mark as Refunded
										</button>
									)}
									{/* Approve Change Request - available for CHANGES_REQUESTED orders */}
									{o.deliveryStatus === 'CHANGES_REQUESTED' && (
										<button 
											onClick={() => approveChange(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
											title="Approve change request and unlock selection"
										>
											Approve Change Request
										</button>
									)}
									{/* Upload Final Photos - available for CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, or PREPARING_DELIVERY orders */}
									{(o.deliveryStatus === 'CLIENT_APPROVED' || o.deliveryStatus === 'AWAITING_FINAL_PHOTOS' || o.deliveryStatus === 'PREPARING_DELIVERY') && (
										<div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
											<input
												type="file"
												multiple
												accept="image/*"
												onChange={(e) => {
													const files = Array.from(e.target.files || []);
													setFinalFiles({ ...finalFiles, [o.orderId]: files });
												}}
												style={{ fontSize: '12px' }}
											/>
											<button 
												onClick={() => uploadFinalPhotos(o.orderId)}
												disabled={!finalFiles[o.orderId] || finalFiles[o.orderId].length === 0 || uploadingFinal[o.orderId]}
												style={{ padding: '4px 8px', fontSize: '12px', background: uploadingFinal[o.orderId] ? '#ccc' : '#6c757d', color: 'white', border: 'none', borderRadius: 4, cursor: uploadingFinal[o.orderId] ? 'not-allowed' : 'pointer' }}
												title="Upload processed photos (stored in original, unprocessed format)"
											>
												{uploadingFinal[o.orderId] ? 'Uploading...' : 'Upload Final Photos'}
											</button>
										</div>
									)}
									{/* Send Final Link - available for PREPARING_DELIVERY orders with PAID payment */}
									{/* This action sends the final link email AND marks the order as DELIVERED */}
									{/* Only available after photos are uploaded (status changed to PREPARING_DELIVERY) */}
									{o.deliveryStatus === 'PREPARING_DELIVERY' && o.paymentStatus === 'PAID' && (
										<button 
											onClick={() => sendFinalLink(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
											title="Send final link to client, mark as delivered, and clean up originals/thumbs/previews"
										>
											Send Final Link
										</button>
									)}
								</td>
							</tr>
						))
					)}
				</tbody>
			</table>
			</div>
		</div>
	);
}


