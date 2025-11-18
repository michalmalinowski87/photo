import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../lib/api';
import { initAuth, getIdToken, signOut } from '../lib/auth';

export default function Orders() {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState('');
	const [galleryId, setGalleryId] = useState('');
	const [idToken, setIdToken] = useState('');
	const [orders, setOrders] = useState([]);
	const [message, setMessage] = useState('');
	const [downloadingZip, setDownloadingZip] = useState({});
	const [generatingZip, setGeneratingZip] = useState({});
	const [uploadingFinal, setUploadingFinal] = useState({});
	const [finalFiles, setFinalFiles] = useState({});

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
		
		// Initialize auth and try to get token
		const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
		const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
		if (userPoolId && clientId) {
			initAuth(userPoolId, clientId);
			getIdToken().then(token => {
				setIdToken(token);
			}).catch(() => {
				// No valid session, check localStorage for manual token
				const stored = localStorage.getItem('idToken');
				if (stored) setIdToken(stored);
			});
		} else {
			// Fallback to localStorage for manual token
			const stored = localStorage.getItem('idToken');
			if (stored) setIdToken(stored);
		}
	}, []);

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
			
			// Extract items array
			const ordersData = parsedData?.items;
			
			if (Array.isArray(ordersData)) {
				setOrders(ordersData);
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
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/regenerate-zip`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			if (data.zipKey) {
				setMessage(`ZIP generated successfully for order ${orderId}`);
				await loadOrders(); // Reload to get the updated zipKey
			} else {
				setMessage('ZIP generation completed but no zipKey returned');
			}
		} catch (error) {
			setMessage(formatApiError(error));
		} finally {
			setGeneratingZip({});
		}
	}

	async function downloadZip(orderId) {
		setMessage('');
		setDownloadingZip({ [orderId]: true });
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`, {
				method: 'GET',
			headers: { Authorization: `Bearer ${idToken}` }
		});
			if (data.downloadUrl) {
				// Open download URL in new window/tab
				window.open(data.downloadUrl, '_blank');
				setMessage(`Download started for order ${orderId}`);
			} else {
				setMessage('No download URL returned');
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
		if (!window.confirm('Mark this order as canceled? This action cannot be undone.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-canceled`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Order marked as canceled');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function markAsRefunded(orderId) {
		setMessage('');
		if (!window.confirm('Mark this order as refunded? This should only be done if a refund was processed outside the system.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-refunded`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Order marked as refunded');
			await loadOrders();
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	async function markAsDepositPaid(orderId) {
		setMessage('');
		if (!window.confirm('Mark this order as deposit paid? This should only be done if a deposit payment was received outside the system.')) {
			return;
		}
		try {
			await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-deposit-paid`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMessage('Order marked as deposit paid');
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

	const handleLogout = () => {
		signOut();
		localStorage.removeItem('idToken');
		setIdToken('');
		router.push('/login');
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
									{/* Download ZIP - available for orders that are not CANCELLED or DELIVERED */}
									{o.deliveryStatus !== 'CANCELLED' && o.deliveryStatus !== 'DELIVERED' && (
										<>
											{o.zipKey ? (
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
													title="Download ZIP file"
												>
													{downloadingZip[o.orderId] ? 'Downloading...' : 'Download ZIP'}
												</button>
											) : (
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
													title="Generate ZIP file for this order"
												>
													{generatingZip[o.orderId] ? 'Generating...' : 'Generate ZIP'}
												</button>
											)}
										</>
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
											onClick={() => markAsDepositPaid(o.orderId)}
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
									{/* Mark as Refunded - available for orders with PAID or DEPOSIT_PAID payment status */}
									{(o.paymentStatus === 'PAID' || o.paymentStatus === 'DEPOSIT_PAID') && o.paymentStatus !== 'REFUNDED' && o.deliveryStatus !== 'DELIVERED' && (
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
									{/* Upload Final Photos - available for CLIENT_APPROVED orders */}
									{o.deliveryStatus === 'CLIENT_APPROVED' && (
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
									{/* Send Final Link - available for CLIENT_APPROVED orders with PAID payment */}
									{/* This action sends the final link email AND marks the order as DELIVERED */}
									{o.deliveryStatus === 'CLIENT_APPROVED' && o.paymentStatus === 'PAID' && (
										<button 
											onClick={() => sendFinalLink(o.orderId)}
											style={{ marginRight: 8, padding: '4px 8px', fontSize: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
											title="Send final link to client, mark as delivered, and clean up originals/thumbs/previews"
										>
											Send Final Link
										</button>
									)}
									{/* Mark Delivered - available for CLIENT_APPROVED orders with PAID payment */}
									{/* This is a separate action if photographer wants to mark delivered without sending email */}
									{o.deliveryStatus === 'CLIENT_APPROVED' && o.paymentStatus === 'PAID' && (
										<button 
											onClick={() => processedComplete(o.orderId)}
											style={{ padding: '4px 8px', fontSize: '12px', background: '#ff9900', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
											title="Mark as delivered and clean up originals/thumbs/previews (without sending email)"
										>
											Mark Delivered
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


