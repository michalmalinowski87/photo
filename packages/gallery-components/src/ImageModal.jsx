import React, { useEffect, useState, useRef } from 'react';
import { getInitialImageUrl, getNextFallbackUrl } from './imageFallback';

export default function ImageModal({
	image,
	images = [],
	index,
	onClose,
	onNavigate,
	onToggle,
	canSelect = false,
	isProcessed = false,
	selectedKeys
}) {
	if (!image || index === null || index === undefined) {
		return null;
	}

	const [currentImageUrl, setCurrentImageUrl] = useState(null);
	const fallbackAttemptsRef = useRef(new Set());
	const attemptedSizesRef = useRef(new Set());

	useEffect(() => {
		function handleKeyDown(e) {
			if (e.key === 'Escape' && onClose) {
				onClose();
			}
			if (e.key === 'ArrowLeft' && onNavigate) {
				onNavigate('prev');
			}
			if (e.key === 'ArrowRight' && onNavigate) {
				onNavigate('next');
			}
		}
		
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onClose, onNavigate]);

	// For full-screen modal viewing, always use previewUrl (1400px) for best quality
	// Fallback to bigThumbUrl or thumbUrl if previewUrl not available
	// For processed photos: use previewUrl for display, finalUrl for download
	// For originals: use previewUrl for display
	// Progressive fallback: CloudFront → S3 presigned → next size → original
	// Strategy defined in imageFallback.js
	useEffect(() => {
		const preferredSize = isProcessed ? 'preview' : 'preview';
		const initialUrl = getInitialImageUrl(image, preferredSize);
		setCurrentImageUrl(initialUrl);
		fallbackAttemptsRef.current.clear();
		attemptedSizesRef.current.clear();
		attemptedSizesRef.current.add(preferredSize);
	}, [image, isProcessed]);

	const handleImageError = (e) => {
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

		const preferredSize = isProcessed ? 'preview' : 'preview';
		const nextUrl = getNextFallbackUrl(failedUrl, image, attemptedSizesRef.current, preferredSize);
		if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
			// Mark the size of the next URL as attempted
			const nextSize = getSizeFromUrl(nextUrl);
			if (nextSize) {
				attemptedSizesRef.current.add(nextSize);
			}
			setCurrentImageUrl(nextUrl);
			return;
		}
	};

	const isSelected = selectedKeys && selectedKeys.has && selectedKeys.has(image.key);

	return (
		<div
			onClick={onClose}
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
					onClick={onClose}
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
				{!isProcessed && isSelected && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							if (canSelect && onToggle) {
								onToggle(image.key);
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
				{images.length > 1 && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							if (onNavigate) {
								onNavigate('prev');
							}
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
				{currentImageUrl ? (
					<img
						src={currentImageUrl}
						alt={image.key}
						onError={handleImageError}
						onContextMenu={(e) => {
							// Allow right-click save on processed photos
							if (isProcessed && image.finalUrl) {
								e.preventDefault();
								const link = document.createElement('a');
								link.href = image.finalUrl;
								link.download = image.key;
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
				{images.length > 1 && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							if (onNavigate) {
								onNavigate('next');
							}
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
					{index + 1} / {images.length}
				</div>
			</div>
		</div>
	);
}

