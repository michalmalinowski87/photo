import React from 'react';
import GalleryThumbnails from './GalleryThumbnails';
import SelectionActions from './SelectionActions';

export default function PurchaseView({
	galleryId,
	images = [],
	selectedKeys = new Set(),
	onToggle,
	onDelete,
	onImageClick,
	galleryInfo = {},
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
	meetsMinimumSelection = true,
	showDeleteButton = false
}) {
	const selectedCount = selectedKeys.size;

	return (
		<div>
			{/* Status & Actions */}
			<SelectionActions
				galleryInfo={galleryInfo}
				selectedCount={selectedCount}
				onApprove={onApprove}
				onRequestChange={onRequestChange}
				canSelect={canSelect}
				canRequestChange={canRequestChange}
				saving={saving}
				isPurchaseMore={isPurchaseMore}
				includedCount={includedCount}
				extraPriceCents={extraPriceCents}
				currentOverageCount={currentOverageCount}
				currentOverageCents={currentOverageCents}
				minSelectionRequired={minSelectionRequired}
				meetsMinimumSelection={meetsMinimumSelection}
			/>

			{/* Image Grid */}
			<GalleryThumbnails
				images={images}
				selectedKeys={selectedKeys}
				onToggle={onToggle}
				onDelete={onDelete}
				onImageClick={onImageClick}
				canSelect={canSelect}
				showDeleteButton={showDeleteButton}
			/>
		</div>
	);
}

