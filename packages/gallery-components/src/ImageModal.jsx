import React, { useEffect } from 'react';

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

	const imageUrl = isProcessed ? image.finalUrl : image.previewUrl;
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
				{imageUrl ? (
					<img
						src={imageUrl}
						alt={image.key}
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

