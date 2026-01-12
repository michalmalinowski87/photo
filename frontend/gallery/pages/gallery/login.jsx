import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../../lib/api';

export default function GalleryLogin() {
	const router = useRouter();
	const { id } = router.query;
	const [apiUrl, setApiUrl] = useState('');
	const [password, setPassword] = useState('');
	const [galleryName, setGalleryName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
	}, []);

	// Get gallery ID from query param or router
	const galleryId = id || router.query.id;

	// Check if already logged in
	useEffect(() => {
		if (!galleryId || !apiUrl) return;
		
		const token = localStorage.getItem(`gallery_token_${galleryId}`);
		if (token) {
			// Token exists, redirect to gallery
			router.replace(`/gallery/${galleryId}`);
		} else {
			setChecking(false);
		}
	}, [galleryId, apiUrl, router]);

	async function handleLogin(e) {
		e.preventDefault();
		if (!apiUrl || !galleryId || !password) {
			setError('Proszę wypełnić wszystkie pola');
			return;
		}

		setLoading(true);
		setError('');

		try {
			const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/client-login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});

			// Store token in localStorage
			localStorage.setItem(`gallery_token_${galleryId}`, data.token);
			if (data.galleryName) {
				localStorage.setItem(`gallery_name_${galleryId}`, data.galleryName);
				setGalleryName(data.galleryName);
			}

			// Redirect to gallery
			router.push(`/gallery/${galleryId}`);
		} catch (err) {
			setError(formatApiError(err));
			setLoading(false);
		}
	}

	if (checking) {
		return (
			<div style={{
				minHeight: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
				fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
			}}>
				<div style={{
					background: 'white',
					padding: '40px',
					borderRadius: '12px',
					boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
					textAlign: 'center'
				}}>
					<div style={{ fontSize: '18px', color: '#666' }}>Ładowanie...</div>
				</div>
			</div>
		);
	}

	const displayName = galleryName || 'Twoja Galeria';
	
	if (!galleryId) {
		return (
			<div style={{
				minHeight: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
				fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
			}}>
				<div style={{
					background: 'white',
					padding: '40px',
					borderRadius: '12px',
					boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
					textAlign: 'center'
				}}>
					<div style={{ fontSize: '18px', color: '#c33' }}>Wymagane ID galerii</div>
				</div>
			</div>
		);
	}

	return (
		<div style={{
			minHeight: '100vh',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			padding: '20px'
		}}>
			<div style={{
				background: 'white',
				padding: '48px',
				borderRadius: '16px',
				boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
				width: '100%',
				maxWidth: '420px'
			}}>
				<div style={{
					marginBottom: '32px',
					textAlign: 'center'
				}}>
					<div style={{
						fontSize: '32px',
						fontWeight: 'bold',
						color: '#1a1a1a',
						marginBottom: '8px'
					}}>
						{displayName}
					</div>
					<div style={{
						fontSize: '16px',
						color: '#666',
						marginTop: '8px'
					}}>
						Wprowadź hasło, aby uzyskać dostęp do zdjęć
					</div>
				</div>

				<form onSubmit={handleLogin}>
					<div style={{ marginBottom: '24px' }}>
						<label style={{
							display: 'block',
							fontSize: '14px',
							fontWeight: '600',
							color: '#333',
							marginBottom: '8px'
						}}>
							Hasło
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Wprowadź hasło do galerii"
							disabled={loading}
							style={{
								width: '100%',
								padding: '14px 16px',
								fontSize: '16px',
								border: '2px solid #e0e0e0',
								borderRadius: '8px',
								boxSizing: 'border-box',
								transition: 'border-color 0.2s',
								outline: 'none'
							}}
							onFocus={(e) => e.target.style.borderColor = '#667eea'}
							onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
							autoFocus
						/>
					</div>

					{error && (
						<div style={{
							marginBottom: '20px',
							padding: '12px',
							background: '#fee',
							border: '1px solid #fcc',
							borderRadius: '8px',
							color: '#c33',
							fontSize: '14px'
						}}>
							{error}
						</div>
					)}

					<button
						type="submit"
						disabled={loading || !password}
						style={{
							width: '100%',
							padding: '14px',
							fontSize: '16px',
							fontWeight: '600',
							color: 'white',
							background: loading || !password ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
							border: 'none',
							borderRadius: '8px',
							cursor: loading || !password ? 'not-allowed' : 'pointer',
							transition: 'opacity 0.2s',
							boxShadow: loading || !password ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.4)'
						}}
						onMouseEnter={(e) => {
							if (!loading && password) {
								e.target.style.opacity = '0.9';
							}
						}}
						onMouseLeave={(e) => {
							e.target.style.opacity = '1';
						}}
					>
						{loading ? 'Logowanie...' : 'Zaloguj się'}
					</button>
				</form>
			</div>
		</div>
	);
}

