import React, { useState } from 'react';
import Button from '../ui/button/Button';
import { useToast } from '../../hooks/useToast';
import api, { formatApiError } from '../../lib/api-service';
import { formatPrice } from '../../lib/format-price';

interface PlanOption {
	name: string;
	priceCents: number;
	storage: string;
	duration: string;
	planKey: string;
}

interface GalleryPricingModalProps {
	isOpen: boolean;
	onClose: () => void;
	galleryId: string;
	suggestedPlan: PlanOption;
	originalsLimitBytes: number;
	finalsLimitBytes: number;
	uploadedSizeBytes: number;
	selectionEnabled: boolean;
	usagePercentage?: number;
	isNearCapacity?: boolean;
	isAtCapacity?: boolean;
	exceedsLargestPlan?: boolean;
	nextTierPlan?: PlanOption & { storageLimitBytes: number };
	onPlanSelected?: () => void;
}

export const GalleryPricingModal: React.FC<GalleryPricingModalProps> = ({
	isOpen,
	onClose,
	galleryId,
	suggestedPlan,
	originalsLimitBytes,
	finalsLimitBytes,
	uploadedSizeBytes,
	selectionEnabled,
	usagePercentage,
	isNearCapacity,
	isAtCapacity,
	exceedsLargestPlan,
	nextTierPlan,
	onPlanSelected,
}) => {
	const { showToast } = useToast();
	const [isProcessing, setIsProcessing] = useState(false);

	if (!isOpen) return null;

	const formatBytes = (bytes: number): string => {
		if (bytes < 1024 * 1024 * 1024) {
			return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		}
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	};

	// formatPrice is now imported from format-price utility

	const handleSelectPlan = async () => {
		setIsProcessing(true);
		try {
			// First, update gallery with the selected plan details
			// This ensures the gallery has plan, priceCents, and limits set before payment
			await api.galleries.update(galleryId, {
				plan: suggestedPlan.planKey,
				priceCents: suggestedPlan.priceCents,
				originalsLimitBytes: originalsLimitBytes,
				finalsLimitBytes: finalsLimitBytes,
			});
			
			// Now proceed to payment
			const paymentResult = await api.galleries.pay(galleryId, {});
			
			if (paymentResult.checkoutUrl) {
				// Redirect to Stripe checkout
				window.location.href = paymentResult.checkoutUrl;
			} else if (paymentResult.paid) {
				// Already paid or paid via wallet
				showToast('success', 'Sukces', 'Plan został wybrany i opłacony!');
				onPlanSelected?.();
				onClose();
			} else {
				showToast('error', 'Błąd', 'Nie udało się przetworzyć płatności.');
			}
		} catch (error) {
			showToast('error', 'Błąd', formatApiError(error));
		} finally {
			setIsProcessing(false);
		}
	};

	const uploadedMB = (uploadedSizeBytes / (1024 * 1024)).toFixed(2);
	const originalsLimitGB = formatBytes(originalsLimitBytes);
	const finalsLimitGB = formatBytes(finalsLimitBytes);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
			<div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
				<div className="p-6">
					<h2 className="text-2xl font-bold text-gray-900 mb-4">
						Wybierz plan dla swojej galerii
					</h2>

					{/* Uploaded Size Info */}
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
						<p className="text-sm text-gray-700 mb-1">
							<strong>Przesłany rozmiar:</strong> {uploadedMB} MB
						</p>
						<p className="text-xs text-gray-600">
							Plan został automatycznie dopasowany do rozmiaru przesłanych zdjęć.
						</p>
					</div>

					{/* USER-CENTRIC FIX #1: Capacity Warning */}
					{(() => {
						const usagePercentage = (uploadedSizeBytes / originalsLimitBytes) * 100;
						const usedGB = (uploadedSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
						const limitGB = (originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
						
						if (usagePercentage >= 95) {
							return (
								<div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
									<div className="flex items-start">
										<svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
											<path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
										</svg>
										<div>
											<p className="text-sm font-semibold text-yellow-800 mb-1">
												Uwaga: Galeria jest prawie pełna
											</p>
											<p className="text-sm text-yellow-700 mb-2">
												Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}% pojemności).
												Po opłaceniu będziesz mógł przesłać tylko niewielką ilość dodatkowych zdjęć.
											</p>
											<p className="text-xs text-yellow-600">
												💡 <strong>Wskazówka:</strong> Rozważ wybór większego planu, aby mieć więcej miejsca na przyszłe zdjęcia.
											</p>
										</div>
									</div>
								</div>
							);
						} else if (usagePercentage >= 80) {
							return (
								<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
									<p className="text-sm text-blue-700">
										ℹ️ Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}% pojemności).
										Po opłaceniu będziesz mógł przesłać jeszcze {((originalsLimitBytes - uploadedSizeBytes) / (1024 * 1024 * 1024)).toFixed(1)} GB zdjęć.
									</p>
								</div>
							);
						}
						return null;
					})()}

					{/* Suggested Plan */}
					<div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-6 mb-4">
						<div className="flex items-start justify-between mb-4">
							<div>
								<h3 className="text-xl font-bold text-gray-900 mb-2">
									Zaproponowany plan
								</h3>
								<p className="text-lg font-semibold text-blue-600 mb-1">
									{suggestedPlan.name}
								</p>
							</div>
							<div className="text-right">
								<p className="text-3xl font-bold text-blue-600">
									{formatPrice(suggestedPlan.priceCents)}
								</p>
								{!selectionEnabled && (
									<p className="text-sm text-green-600 mt-1">(zniżka 20%)</p>
								)}
							</div>
						</div>

						{/* Plan Details */}
						<div className="grid grid-cols-2 gap-4 mb-4">
							<div className="bg-white rounded-lg p-3 border border-blue-200">
								<p className="text-xs text-gray-600 mb-1">Limit oryginałów</p>
								<p className="text-lg font-semibold text-gray-900">{originalsLimitGB}</p>
							</div>
							<div className="bg-white rounded-lg p-3 border border-blue-200">
								<p className="text-xs text-gray-600 mb-1">Limit finalnych</p>
								<p className="text-lg font-semibold text-gray-900">{finalsLimitGB}</p>
							</div>
						</div>

						{/* Gallery Type Info */}
						<div className="bg-white rounded-lg p-3 border border-blue-200">
							<p className="text-sm text-gray-700">
								<strong>Typ galerii:</strong>{' '}
								{selectionEnabled ? (
									<span>Z selekcją klienta</span>
								) : (
									<span>
										Bez selekcji <span className="text-green-600">(zniżka 20%)</span>
									</span>
								)}
							</p>
							{selectionEnabled && (
								<p className="text-xs text-gray-600 mt-1">
									Limit finalnych zdjęć jest taki sam jak limit oryginałów (darmowy bufor).
								</p>
							)}
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-col sm:flex-row gap-3 justify-end">
						<Button
							variant="secondary"
							onClick={onClose}
							disabled={isProcessing}
						>
							Anuluj
						</Button>
						<Button
							variant="primary"
							onClick={handleSelectPlan}
							disabled={isProcessing}
						>
							{isProcessing ? 'Przetwarzanie...' : 'Wybierz plan i opłać'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

