import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../lib/api';
import { initAuth, getIdToken, signOut } from '../lib/auth';

export default function Galleries() {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState('');
	const [idToken, setIdToken] = useState('');
	const [grid, setGrid] = useState('');
	const [msg, setMsg] = useState('');
	const [file, setFile] = useState(null);
	const [clientEmail, setClientEmail] = useState('snky1987@gmail.com');
	const [clientPass, setClientPass] = useState('1nasa1');
	const [galleryName, setGalleryName] = useState('');
	const [plan, setPlan] = useState('Basic');
	const [pkgName, setPkgName] = useState('Basic');
	const [pkgIncluded, setPkgIncluded] = useState(1);
	const [pkgExtra, setPkgExtra] = useState(500);
	const [selectionEnabled, setSelectionEnabled] = useState(true);
	const [hasBackupAddon, setHasBackupAddon] = useState(false);
	const [galleriesList, setGalleriesList] = useState([]);
	const [purchasingAddon, setPurchasingAddon] = useState({});
	const [loading, setLoading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState({});

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
	
	
	const handleLogout = () => {
		signOut();
		localStorage.removeItem('idToken');
		setIdToken('');
		router.push('/login');
	};

	async function loadGalleries() {
		if (!apiUrl || !idToken) {
			setMsg('Need API URL and ID Token');
			return;
		}
		setLoading(true);
		setMsg('');
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setGalleriesList(data.items || []);
		} catch (error) {
			setMsg(formatApiError(error));
		} finally {
			setLoading(false);
		}
	}


	async function purchaseAddon(galleryId) {
		setMsg('');
		setPurchasingAddon({ [galleryId]: true });
		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/purchase-addon`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setMsg(`Backup storage addon purchased successfully for gallery. Price: ${(data.backupStorageCents / 100).toFixed(2)} PLN. ZIPs generated for ${data.generatedZipsCount || 0} order(s).`);
			await loadGalleries(); // Reload to get updated addon status
		} catch (error) {
			setMsg(formatApiError(error));
		} finally {
			setPurchasingAddon({});
		}
	}

	async function handleAction(action, galleryId) {
		setMsg('');
		try {
			switch (action) {
				case 'purchase-addon':
					await purchaseAddon(galleryId);
					break;
				case 'send-to-client':
					try {
						await apiFetch(`${apiUrl}/galleries/${galleryId}/send-to-client`, {
							method: 'POST',
							headers: { 
								'Content-Type': 'application/json',
								Authorization: `Bearer ${idToken}` 
							},
							body: JSON.stringify({}) // Password will be retrieved from stored encrypted value
						});
						setMsg('Gallery invitation and password emails sent to client');
						await loadGalleries();
					} catch (error) {
						setMsg(formatApiError(error));
					}
					break;
				case 'open-client':
					// Gallery app runs on different port (default: localhost:3001)
					const galleryUrl = process.env.NEXT_PUBLIC_GALLERY_URL || 'http://localhost:3001';
					window.open(`${galleryUrl}/gallery/${galleryId}`, '_blank');
					break;
				case 'delete':
					if (!confirm(`Are you sure you want to delete gallery ${galleryId}? This will permanently delete all images, selections, and orders. This action cannot be undone.`)) {
						return;
					}
					try {
						const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}`, {
							method: 'DELETE',
							headers: { Authorization: `Bearer ${idToken}` }
						});
						setMsg(`Gallery deleted: ${data.s3ObjectsDeleted || 0} S3 objects removed`);
						await loadGalleries(); // Refresh the list
					} catch (error) {
						setMsg(formatApiError(error));
					}
					break;
				default:
					setMsg(`Unknown action: ${action}`);
			}
		} catch (error) {
			setMsg(formatApiError(error));
		}
	}

	async function createGallery() {
		setMsg('');
		
		// Validate required pricing package fields
		if (!pkgName || pkgIncluded === undefined || pkgExtra === undefined) {
			setMsg('Please fill in all Client Pricing Package fields (Name, Included Photos, Extra Price)');
			return;
		}
		
		if (pkgIncluded < 0 || pkgExtra < 0) {
			setMsg('Included Photos and Extra Price must be 0 or greater');
			return;
		}
		
		try {
			const requestBody = { 
				plan: plan,
				selectionEnabled: selectionEnabled, // Use checkbox value
				pricingPackage: {
					packageName: pkgName,
					includedCount: Number(pkgIncluded),
					extraPriceCents: Number(pkgExtra)
				},
				hasBackupStorage: hasBackupAddon
			};
			
			// Add galleryName if provided
			if (galleryName && galleryName.trim()) {
				requestBody.galleryName = galleryName.trim();
			}
			
			// Add clientEmail and clientPassword if provided (for selection-enabled galleries)
			if (clientEmail && clientEmail.trim()) {
				requestBody.clientEmail = clientEmail.trim();
				if (clientPass && clientPass.trim()) {
					requestBody.clientPassword = clientPass.trim();
				}
			}
			
			const { data } = await apiFetch(`${apiUrl}/galleries`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
			body: JSON.stringify(requestBody)
		});
			
			if (data.checkoutUrl) {
				// Payment required - redirect to Stripe checkout
				setMsg(`Payment required. Redirecting to checkout...`);
				window.location.href = data.checkoutUrl;
			} else if (data.paid) {
				// Paid via wallet
				setGrid(data.galleryId || '');
				setMsg(`Created gallery ${data.galleryId} (paid via wallet)`);
				await loadGalleries(); // Refresh list
			} else {
				// Created but not paid (shouldn't happen if Stripe is configured)
				setGrid(data.galleryId || '');
				setMsg(`Created gallery ${data.galleryId} (payment pending)`);
				await loadGalleries(); // Refresh list
			}
		} catch (error) {
			setMsg(formatApiError(error));
		}
	}

	async function uploadOriginal() {
		if (!file) return setMsg('Pick a file');
		setMsg('');
		const fileName = file.name;
		setUploadProgress({ [fileName]: 0 });
		
		try {
			const { data: pr } = await apiFetch(`${apiUrl}/uploads/presign`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
				body: JSON.stringify({ galleryId: grid, key: `originals/${fileName}`, contentType: file.type || 'application/octet-stream', fileSize: file.size })
		});
			
			// Use XMLHttpRequest for progress tracking
			await new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.upload.addEventListener('progress', (e) => {
					if (e.lengthComputable) {
						const percent = Math.round((e.loaded / e.total) * 100);
						setUploadProgress({ [fileName]: percent });
					}
				});
				xhr.addEventListener('load', () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						setUploadProgress({ [fileName]: 100 });
						setTimeout(() => {
							setUploadProgress({});
							setMsg(`Uploaded originals/${fileName}`);
						}, 500);
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
		} catch (error) {
			setUploadProgress({});
			setMsg(formatApiError(error));
		}
	}


	return (
		<div style={{ padding: 24 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ margin: 0 }}>Galleries</h1>
				{idToken && <button onClick={handleLogout} style={{ padding: '8px 16px' }}>Logout</button>}
			</div>
			<div style={{ marginBottom: 8 }}>
				<label>API URL </label>
				<input style={{ width: '100%', maxWidth: 420 }} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
			</div>
			<div style={{ marginBottom: 8 }}>
				<label>ID Token </label>
				<input style={{ width: '100%', maxWidth: 420 }} value={idToken} onChange={(e) => setIdToken(e.target.value)} placeholder="Auto-filled if logged in" />
				{!idToken && <span style={{ marginLeft: 8, color: '#666' }}>or <a href="/login">login here</a></span>}
			</div>
			
			{/* Gallery List View */}
			<div style={{ margin: '24px 0', padding: 16, border: '1px solid #ddd', borderRadius: '8px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
					<h2 style={{ margin: 0 }}>My Galleries</h2>
					<button onClick={loadGalleries} disabled={loading || !apiUrl || !idToken} style={{ padding: '8px 16px' }}>
						{loading ? 'Loading...' : 'Refresh List'}
					</button>
				</div>
				{galleriesList.length === 0 && !loading && (
					<p style={{ color: '#666' }}>No galleries found. Create one below or click Refresh List.</p>
				)}
				{loading && <p>Loading galleries...</p>}
				{galleriesList.length > 0 && (
					<div style={{ overflowX: 'auto' }}>
						<table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, minWidth: 600 }}>
						<thead>
							<tr style={{ background: '#f5f5f5' }}>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Gallery ID</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Plan</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Storage</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Expires</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Pricing</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Orders</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Revenue</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Addons</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Created</th>
								<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{galleriesList.map((g) => (
								<tr key={g.galleryId}>
									<td style={{ padding: 8, border: '1px solid #ddd' }}>
										{g.galleryName ? (
											<div>
												<div style={{ fontWeight: 'bold', marginBottom: 2 }}>{g.galleryName}</div>
												<code style={{ fontSize: '11px', color: '#666' }}>{g.galleryId}</code>
											</div>
										) : (
											<code style={{ fontSize: '12px' }}>{g.galleryId}</code>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{g.plan ? (
											<div>
												<div><strong>{g.plan}</strong></div>
												<div>{(g.priceCents || 0) / 100} PLN</div>
											</div>
										) : (
											<span style={{ color: '#999' }}>N/A</span>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{g.storageLimitBytes ? (
											<div>
												<div>
													{((g.bytesUsed || 0) / (1024 * 1024)).toFixed(2)} MB / {(g.storageLimitBytes / (1024 * 1024)).toFixed(2)} MB
												</div>
												<div style={{ width: '100px', background: '#f0f0f0', borderRadius: 4, height: 8, marginTop: 4 }}>
													<div style={{
														width: `${Math.min(100, ((g.bytesUsed || 0) / g.storageLimitBytes) * 100)}%`,
														background: ((g.bytesUsed || 0) / g.storageLimitBytes) > 0.8 ? '#dc3545' : '#28a745',
														height: '100%',
														borderRadius: 4,
														transition: 'width 0.3s'
													}} />
												</div>
												{((g.bytesUsed || 0) / g.storageLimitBytes) > 0.8 && (
													<div style={{ fontSize: '10px', color: '#dc3545', marginTop: 2 }}>⚠️ Near limit</div>
												)}
											</div>
										) : (
											<span style={{ color: '#999' }}>N/A</span>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{g.expiresAt ? (
											<div>
												<div>{new Date(g.expiresAt).toLocaleDateString()}</div>
												<div style={{ fontSize: '10px', color: '#666' }}>
													{new Date(g.expiresAt).toLocaleTimeString()}
												</div>
											</div>
										) : (
											<span style={{ color: '#999' }}>N/A</span>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{g.pricingPackage ? (
											<div>
												<div><strong>{g.pricingPackage.packageName}</strong></div>
												<div>{g.pricingPackage.includedCount || 0} included</div>
												<div>{(g.pricingPackage.extraPriceCents || 0) / 100} PLN/extra</div>
											</div>
										) : (
											<span style={{ color: '#999' }}>Not set</span>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd' }}>
										<a 
											href={`/orders?galleryId=${g.galleryId}`}
											style={{ color: '#007bff', textDecoration: 'none', fontWeight: 'bold' }}
										>
											{g.orderCount || 0} orders
										</a>
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd' }}>{(g.totalRevenueCents || 0) / 100} PLN</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{g.hasBackupStorage ? (
											<span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ Backup Storage</span>
										) : (
											<button 
												onClick={() => handleAction('purchase-addon', g.galleryId)} 
												disabled={purchasingAddon[g.galleryId]}
												style={{ 
													padding: '4px 8px', 
													fontSize: '11px', 
													background: '#ff9800', 
													color: 'white', 
													border: 'none', 
													borderRadius: 4, 
													cursor: purchasingAddon[g.galleryId] ? 'not-allowed' : 'pointer',
													opacity: purchasingAddon[g.galleryId] ? 0.6 : 1
												}}
												title="Purchase backup storage addon for this gallery"
											>
												{purchasingAddon[g.galleryId] ? 'Purchasing...' : 'Buy Backup'}
											</button>
										)}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
										{new Date(g.createdAt).toLocaleDateString()}
									</td>
									<td style={{ padding: 8, border: '1px solid #ddd' }}>
										{/* Send to Client - only if selectionEnabled and clientEmail exist */}
										{g.selectionEnabled && g.clientEmail && (
											<button 
												onClick={() => handleAction('send-to-client', g.galleryId)} 
												style={{ 
													marginRight: 4, 
													padding: '4px 8px', 
													fontSize: '12px', 
													background: '#007bff', 
													color: 'white', 
													border: 'none', 
													borderRadius: '4px', 
													cursor: 'pointer' 
												}}
											>
												Send to Client
											</button>
										)}
										{/* Open Client View */}
										<button 
											onClick={() => handleAction('open-client', g.galleryId)} 
											style={{ 
												marginRight: 4, 
												padding: '4px 8px', 
												fontSize: '12px',
												background: '#6c757d',
												color: 'white',
												border: 'none',
												borderRadius: '4px',
												cursor: 'pointer'
											}}
										>
											Open Client View
										</button>
										{/* View as Owner */}
										<button 
											onClick={() => router.push(`/galleries/${g.galleryId}/view`)} 
											style={{ 
												marginRight: 4, 
												padding: '4px 8px', 
												fontSize: '12px',
												background: '#007bff',
												color: 'white',
												border: 'none',
												borderRadius: '4px',
												cursor: 'pointer'
											}}
										>
											View as Owner
										</button>
										{/* Delete */}
										<button 
											onClick={() => handleAction('delete', g.galleryId)} 
											style={{ 
												padding: '4px 8px', 
												fontSize: '12px',
												background: '#dc3545',
												color: 'white',
												border: 'none',
												borderRadius: '4px',
												cursor: 'pointer'
											}}
										>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					</div>
				)}
			</div>

			<div style={{ marginBottom: 8 }}>
				<label>Gallery ID </label>
				<input style={{ width: '100%', maxWidth: 420 }} value={grid} onChange={(e) => setGrid(e.target.value)} />
			</div>
			<div style={{ margin: '12px 0', padding: 12, border: '1px solid #eee' }}>
				<h3>Create Gallery</h3>
				<div style={{ marginBottom: 8 }}>
					<label>Gallery Name (optional): </label>
					<input 
						type="text" 
						value={galleryName} 
						onChange={(e) => setGalleryName(e.target.value)} 
						placeholder="e.g., Wedding Photos 2024"
						style={{ width: '100%', maxWidth: 300, marginLeft: 8 }}
					/>
					<div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
						Used for nicer presentation in emails and UI. Leave empty to use gallery ID.
					</div>
				</div>
				<div style={{ marginBottom: 8 }}>
					<h4>Gallery Plan <span style={{ color: '#cc0000' }}>*</span></h4>
					<select 
						value={plan} 
						onChange={(e) => setPlan(e.target.value)}
						style={{ width: '100%', maxWidth: 300, marginLeft: 8, padding: '4px 8px' }}
					>
						<option value="Basic">Basic - 7 PLN (1 MB, 3 days)</option>
						<option value="Standard">Standard - 10 PLN (10 MB, 1 month)</option>
						<option value="Pro">Pro - 15 PLN (100 MB, 3 months)</option>
					</select>
					<div style={{ fontSize: '12px', color: '#666', marginTop: 4, marginLeft: 8 }}>
						{plan === 'Basic' && '1 MB storage limit, expires in 3 days'}
						{plan === 'Standard' && '10 MB storage limit, expires in 1 month'}
						{plan === 'Pro' && '100 MB storage limit, expires in 3 months'}
					</div>
				</div>
				<div style={{ marginBottom: 8 }}>
					<h4>Client Pricing Package <span style={{ color: '#cc0000' }}>*</span></h4>
					<div style={{ marginBottom: 4 }}>
						<label>Package Name: </label>
						<input 
							type="text" 
							value={pkgName} 
							onChange={(e) => setPkgName(e.target.value)} 
							placeholder="e.g., Basic, Standard"
							style={{ width: 200, marginLeft: 8 }}
						/>
					</div>
					<div style={{ marginBottom: 4 }}>
						<label>Included Photos: </label>
						<input 
							type="number" 
							value={pkgIncluded} 
							onChange={(e) => setPkgIncluded(Number(e.target.value))} 
							min="0"
							style={{ width: 100, marginLeft: 8 }}
						/>
					</div>
					<div style={{ marginBottom: 4 }}>
						<label>Extra Price (cents): </label>
						<input 
							type="number" 
							value={pkgExtra} 
							onChange={(e) => setPkgExtra(Number(e.target.value))} 
							min="0"
							style={{ width: 100, marginLeft: 8 }}
						/>
						<span style={{ marginLeft: 8, color: '#666', fontSize: '12px' }}>
							({(pkgExtra / 100).toFixed(2)} PLN per extra photo)
						</span>
					</div>
				</div>
				<div style={{ marginBottom: 8, marginTop: 16, padding: 12, background: '#f9f9f9', borderRadius: 4 }}>
					<h4>Gallery Options</h4>
					<div style={{ marginBottom: 12 }}>
						<label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
							<input 
								type="checkbox" 
								checked={selectionEnabled} 
								onChange={(e) => setSelectionEnabled(e.target.checked)} 
								style={{ marginRight: 8 }}
							/>
							<span>Client select photos for processing</span>
						</label>
						<div style={{ fontSize: '12px', color: '#666', marginLeft: 24, marginTop: 4 }}>
							{selectionEnabled 
								? 'Client will select photos. You can send gallery to client for selection.'
								: 'You will process all photos. Order will be created immediately. Only final gallery can be sent to client.'}
						</div>
					</div>
					{selectionEnabled && (
						<>
							<div style={{ fontSize: '12px', color: '#666', marginBottom: 8 }}>
								Set client email and password during creation to enable "Send Gallery to Client" feature. You can also set these later.
							</div>
							<div style={{ marginBottom: 4 }}>
								<label>Client Email: </label>
								<input 
									type="email" 
									value={clientEmail} 
									onChange={(e) => setClientEmail(e.target.value)} 
									placeholder="client@example.com"
									style={{ width: '100%', maxWidth: 300, marginLeft: 8 }}
								/>
							</div>
							<div style={{ marginBottom: 4 }}>
								<label>Client Password: </label>
								<input 
									type="password" 
									value={clientPass} 
									onChange={(e) => setClientPass(e.target.value)} 
									placeholder="Password for client access"
									style={{ width: '100%', maxWidth: 300, marginLeft: 8 }}
								/>
							</div>
						</>
					)}
					<div style={{ marginTop: 12, marginBottom: 12 }}>
						<label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
							<input 
								type="checkbox" 
								checked={hasBackupAddon} 
								onChange={(e) => setHasBackupAddon(e.target.checked)} 
								style={{ marginRight: 8 }}
							/>
							<span>Purchase Backup Storage Addon</span>
						</label>
						<div style={{ fontSize: '12px', color: '#666', marginLeft: 24, marginTop: 4 }}>
							{hasBackupAddon 
								? 'Backup storage addon will be purchased for this gallery. ZIPs will be generated automatically for all orders and kept available for download even after delivery. Price: 30% of order total.'
								: 'Original photos ZIPs will be available for one-time download only. After delivery, originals will be removed unless backup addon is purchased.'}
						</div>
					</div>
				</div>
				<button onClick={createGallery}>Create Gallery</button>
			</div>
			<div style={{ margin: '12px 0', padding: 12, border: '1px solid #eee' }}>
				<h3>Upload Original</h3>
				<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />{' '}
				<button onClick={uploadOriginal} disabled={!file || Object.keys(uploadProgress).length > 0}>
					{Object.keys(uploadProgress).length > 0 ? 'Uploading...' : 'Presign & Upload'}
				</button>
				{Object.keys(uploadProgress).length > 0 && (
					<div style={{ marginTop: 8 }}>
						<div style={{ width: '100%', background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
							<div style={{ 
								width: `${uploadProgress[Object.keys(uploadProgress)[0]]}%`, 
								background: '#0066cc', 
								height: 24, 
								transition: 'width 0.3s',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: 'white',
								fontSize: '12px'
							}}>
								{uploadProgress[Object.keys(uploadProgress)[0]]}%
							</div>
						</div>
					</div>
				)}
			</div>
			{msg ? <p>{msg}</p> : null}
		</div>
	);
}


