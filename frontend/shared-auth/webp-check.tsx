'use client';

import { useEffect, useState } from 'react';

/**
 * Detects WebP support in the browser
 * Returns true if WebP is supported, false otherwise
 */
export function detectWebPSupport(): Promise<boolean> {
	return new Promise((resolve) => {
		const webP = new Image();
		webP.onload = webP.onerror = () => {
			resolve(webP.height === 2);
		};
		webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
	});
}

/**
 * Component that checks WebP support and shows a compatibility message if not supported
 */
export function WebPCompatibilityCheck({ children }: { children: React.ReactNode }) {
	const [isSupported, setIsSupported] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(true);
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
		detectWebPSupport().then((supported) => {
			setIsSupported(supported);
			setIsChecking(false);
		});
	}, []);

	// During SSR, render children immediately to avoid hydration mismatch
	// Only show loading state on the client after mount
	if (!isMounted) {
		return <>{children}</>;
	}

	// Show loading state while checking (only on client)
	if (isChecking) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
				<div style={{ textAlign: 'center' }}>
					<div style={{ 
						display: 'inline-block', 
						animation: 'spin 1s linear infinite',
						borderRadius: '50%',
						height: '32px',
						width: '32px',
						borderBottom: '2px solid #2563eb',
						borderRight: '2px solid transparent',
						borderTop: '2px solid transparent',
						borderLeft: '2px solid transparent'
					}}></div>
					<style>{`
						@keyframes spin {
							to { transform: rotate(360deg); }
						}
					`}</style>
					<p style={{ marginTop: '16px', color: '#4b5563' }}>Sprawdzanie kompatybilności...</p>
				</div>
			</div>
		);
	}

	// If WebP is not supported, show compatibility message
	if (isSupported === false) {
		return (
			<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eff6ff, #eef2ff)', padding: '16px' }}>
				<div style={{ maxWidth: '42rem', width: '100%', backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '32px', textAlign: 'center' }}>
					<div style={{ marginBottom: '24px' }}>
						<svg
							style={{ margin: '0 auto', height: '64px', width: '64px', color: '#f59e0b' }}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<h1 style={{ fontSize: '30px', fontWeight: 'bold', color: '#111827', marginBottom: '16px' }}>
						Twoja przeglądarka nie jest obsługiwana
					</h1>
					<p style={{ fontSize: '18px', color: '#374151', marginBottom: '24px' }}>
						PhotoCloud wymaga nowoczesnej przeglądarki z obsługą formatu WebP do wyświetlania zdjęć.
					</p>
					<div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
						<h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
							Zalecane przeglądarki (minimalne wersje):
						</h2>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', textAlign: 'left' }}>
							<div style={{ display: 'flex', alignItems: 'flex-start' }}>
								<div style={{ width: '32px', height: '32px', backgroundColor: '#2563eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', marginTop: '4px', flexShrink: 0 }}>
									<span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>Ch</span>
								</div>
								<div>
									<div style={{ fontWeight: '600', color: '#111827' }}>Google Chrome</div>
									<div style={{ fontSize: '14px', color: '#4b5563' }}>Wersja 32 lub nowsza</div>
								</div>
							</div>
							<div style={{ display: 'flex', alignItems: 'flex-start' }}>
								<div style={{ width: '32px', height: '32px', backgroundColor: '#ea580c', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', marginTop: '4px', flexShrink: 0 }}>
									<span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>FF</span>
								</div>
								<div>
									<div style={{ fontWeight: '600', color: '#111827' }}>Mozilla Firefox</div>
									<div style={{ fontSize: '14px', color: '#4b5563' }}>Wersja 65 lub nowsza</div>
								</div>
							</div>
							<div style={{ display: 'flex', alignItems: 'flex-start' }}>
								<div style={{ width: '32px', height: '32px', backgroundColor: '#3b82f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', marginTop: '4px', flexShrink: 0 }}>
									<span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>E</span>
								</div>
								<div>
									<div style={{ fontWeight: '600', color: '#111827' }}>Microsoft Edge</div>
									<div style={{ fontSize: '14px', color: '#4b5563' }}>Wersja 18 lub nowsza</div>
								</div>
							</div>
							<div style={{ display: 'flex', alignItems: 'flex-start' }}>
								<div style={{ width: '32px', height: '32px', backgroundColor: '#2563eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', marginTop: '4px', flexShrink: 0 }}>
									<span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>S</span>
								</div>
								<div>
									<div style={{ fontWeight: '600', color: '#111827' }}>Safari</div>
									<div style={{ fontSize: '14px', color: '#4b5563' }}>Wersja 14 lub nowsza (iOS 14+)</div>
								</div>
							</div>
						</div>
					</div>
					<div style={{ fontSize: '14px', color: '#4b5563' }}>
						<p style={{ marginBottom: '8px' }}>
							Zaktualizuj swoją przeglądarkę do najnowszej wersji, aby korzystać z PhotoCloud.
						</p>
						<p>
							WebP jest nowoczesnym formatem obrazów, który zapewnia lepszą jakość przy mniejszym rozmiarze plików.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// WebP is supported, render children
	return <>{children}</>;
}

