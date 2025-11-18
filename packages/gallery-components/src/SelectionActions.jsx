import React from 'react';

export default function SelectionActions({
	galleryInfo = {},
	selectedCount = 0,
	onApprove,
	onRequestChange,
	canSelect = false,
	canRequestChange = false,
	saving = false,
	isPurchaseMore = false,
	includedCount = 0,
	extraPriceCents = 0,
	currentOverageCount = 0,
	currentOverageCents = 0,
	minSelectionRequired = 0,
	meetsMinimumSelection = true
}) {
	const isApproved = galleryInfo?.approved || false;
	const changeRequestPending = galleryInfo?.changeRequestPending || false;

	return (
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
				<strong>Selected:</strong> {selectedCount} photos
				{!isPurchaseMore && includedCount > 0 && (
					<span> ({includedCount} included in package)</span>
				)}
				{isPurchaseMore && (
					<span style={{ color: '#666', fontSize: '14px' }}> (each photo costs extra)</span>
				)}
				{includedCount === 0 && extraPriceCents === 0 && selectedCount > 0 && !isPurchaseMore && (
					<span style={{ color: '#666', fontSize: '14px' }}> (pricing not configured)</span>
				)}
				{galleryInfo && galleryInfo.selectedCount > 0 && galleryInfo.selectedCount !== selectedCount && (
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
			{selectedCount > 0 && currentOverageCount === 0 && includedCount > 0 && !isPurchaseMore && (
				<div style={{ marginBottom: 8, color: '#00aa00' }}>
					✓ All selected photos are included in your package
				</div>
			)}
			{isPurchaseMore && selectedCount > 0 && (
				<div style={{ marginBottom: 8, color: '#cc6600' }}>
					<strong>Total payment:</strong> {selectedCount} photo{selectedCount !== 1 ? 's' : ''} × {(extraPriceCents / 100).toFixed(2)} PLN = {(currentOverageCents / 100).toFixed(2)} PLN
				</div>
			)}
			<div style={{ marginTop: 12 }}>
				{canSelect && onApprove && (
					<button 
						onClick={onApprove} 
						disabled={selectedCount === 0 || saving || !meetsMinimumSelection}
						style={{ marginRight: 8, padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', background: (selectedCount === 0 || saving || !meetsMinimumSelection) ? '#ccc' : '#0066cc', color: 'white', border: 'none', borderRadius: 4, cursor: (selectedCount === 0 || saving || !meetsMinimumSelection) ? 'not-allowed' : 'pointer' }}
					>
						{saving ? 'Approving...' : (isPurchaseMore ? 'Approve Additional Selection' : 'Approve Selection')} ({selectedCount} photos)
					</button>
				)}
				{canRequestChange && onRequestChange && (
					<button 
						onClick={onRequestChange}
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
	);
}

