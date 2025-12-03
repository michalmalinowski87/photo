import React, { useState, useEffect, useRef } from 'react';
import { getInitialImageUrl, getNextFallbackUrl } from './imageFallback';

// Lazy loading component using Intersection Observer with fallback support
// Uses shared fallback strategy from imageFallback.js
function LazyImage({ img, alt, style, onLoad, preferredSize = 'bigthumb' }) {
	const [isInView, setIsInView] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);
	const initialSrc = getInitialImageUrl(img, preferredSize);
	const [currentSrc, setCurrentSrc] = useState(initialSrc);
	const fallbackAttemptsRef = useRef(new Set());
	const attemptedSizesRef = useRef(new Set());
	const imgRef = useRef(null);
	const containerRef = useRef(null);

	useEffect(() => {
		const newSrc = getInitialImageUrl(img, preferredSize);
		setCurrentSrc(newSrc);
		fallbackAttemptsRef.current.clear();
		attemptedSizesRef.current.clear();
		attemptedSizesRef.current.add(preferredSize);
	}, [img, preferredSize]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '50px' } // Start loading 50px before entering viewport
		);

		if (containerRef.current) {
			observer.observe(containerRef.current);
		}

		return () => {
			observer.disconnect();
		};
	}, []);

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
		
		// Prevent infinite fallback loops
		if (fallbackAttemptsRef.current.has(failedUrl)) {
			return;
		}
		fallbackAttemptsRef.current.add(failedUrl);

		// Try next fallback URL
		if (img) {
			const nextUrl = getNextFallbackUrl(failedUrl, img, attemptedSizesRef.current, preferredSize);
			if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
				// Mark the size of the next URL as attempted
				const nextSize = getSizeFromUrl(nextUrl);
				if (nextSize) {
					attemptedSizesRef.current.add(nextSize);
				}
				setCurrentSrc(nextUrl);
				return;
			}
		}
	};

	return (
		<div ref={containerRef} style={style}>
			{isInView ? (
				<img 
					ref={imgRef}
					src={currentSrc} 
					alt={alt}
					loading="lazy"
					style={{ 
						...style,
						opacity: hasLoaded ? 1 : 0,
						transition: 'opacity 0.3s ease-in-out'
					}}
					onLoad={() => {
						setHasLoaded(true);
						if (onLoad) onLoad();
					}}
					onError={handleError}
				/>
			) : (
				<div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f0f0f0' }}>
					Loading...
				</div>
			)}
		</div>
	);
}

export default function GalleryThumbnails({
	images = [],
	selectedKeys = new Set(),
	onToggle,
	onDelete,
	onImageClick,
	canSelect = false,
	showDeleteButton = false
}) {
	if (images.length === 0) {
		return null;
	}

	return (
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
								opacity: 1, // Always full opacity - don't grey out for owner view
								transition: 'all 0.2s',
								boxShadow: isSelected ? '0 4px 12px rgba(255,0,102,0.4)' : '0 2px 4px rgba(0,0,0,0.1)'
							}}
						>
							<div 
								onClick={() => {
									if (canSelect && onToggle) {
										onToggle(img.key);
									} else if (onImageClick) {
										onImageClick(index);
									}
								}}
								onDoubleClick={() => onImageClick && onImageClick(index)}
								style={{ position: 'relative' }}
							>
								{/* Use bigThumbUrl for masonry grid layout, fallback to previewUrl or thumbUrl */}
								{/* Progressive fallback: CloudFront → S3 presigned → next size → original */}
								{/* Strategy defined in imageFallback.js */}
								{(img.bigThumbUrl || img.previewUrl || img.thumbUrl || img.url) ? (
									<LazyImage 
										img={img}
										alt={img.key}
										preferredSize="bigthumb"
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
											if (canSelect && onToggle) {
												onToggle(img.key);
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
								{/* Delete button - show if showDeleteButton is true and onDelete is provided */}
								{showDeleteButton && onDelete && (
									<button
										onClick={(e) => {
											e.stopPropagation();
											onDelete(img.key);
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
								)}
							</div>
							<div style={{ 
								padding: 8, 
								fontSize: '12px', 
								color: '#666',
								textOverflow: 'ellipsis',
								overflow: 'hidden',
								whiteSpace: 'nowrap'
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
				})}
			</div>
		</div>
	);
}

