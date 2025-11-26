import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Button from '../ui/button/Button';
import api, { formatApiError } from '../../lib/api-service';
import { useToast } from '../../hooks/useToast';
import { formatPrice } from '../../lib/format-price';

interface PaymentGuidanceBannerProps {
	galleryId: string;
	gallery: {
		state?: string;
		paymentStatus?: string;
		plan?: string;
		priceCents?: number;
		originalsLimitBytes?: number;
		finalsLimitBytes?: number;
		selectionEnabled?: boolean;
		[key: string]: any;
	};
	onPaymentComplete?: () => void;
}

export const PaymentGuidanceBanner: React.FC<PaymentGuidanceBannerProps> = ({
	galleryId,
	gallery,
	onPaymentComplete,
}) => {
	const router = useRouter();
	const { showToast } = useToast();
	const [walletBalance, setWalletBalance] = useState<number | null>(null);
	const [isLoadingWallet, setIsLoadingWallet] = useState(false);
	const [isProcessingPayment, setIsProcessingPayment] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);
	const [pricingModalData, setPricingModalData] = useState<{
		suggestedPlan: any;
		originalsLimitBytes: number;
		finalsLimitBytes: number;
		uploadedSizeBytes: number;
		selectionEnabled: boolean;
		usagePercentage?: number;
		isNearCapacity?: boolean;
		isAtCapacity?: boolean;
		exceedsLargestPlan?: boolean;
		nextTierPlan?: any;
	} | null>(null);

	// Check if gallery needs payment
	const needsPayment = gallery.state === 'DRAFT' || gallery.paymentStatus === 'UNPAID';
	
	if (!needsPayment) {
		return null;
	}

	useEffect(() => {
		// Load wallet balance
		const loadWalletBalance = async () => {
			setIsLoadingWallet(true);
			try {
				const balance = await api.wallet.getBalance();
				setWalletBalance(balance.balanceCents);
			} catch (error) {
				console.error('Failed to load wallet balance:', error);
				// Don't show error to user, just leave walletBalance as null
			} finally {
				setIsLoadingWallet(false);
			}
		};

		loadWalletBalance();
	}, []);

	const formatBytes = (bytes: number | undefined): string => {
		if (!bytes) return '0 GB';
		if (bytes < 1024 * 1024 * 1024) {
			return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		}
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	};

	const handlePayNow = async () => {
		setIsProcessingPayment(true);
		try {
			// First, calculate plan if not set
			if (!gallery.plan) {
				try {
					const planResult = await api.galleries.calculatePlan(galleryId);
					// Show pricing modal instead of proceeding directly
					// The modal will handle plan selection and payment
					setPricingModalData({
						suggestedPlan: planResult.suggestedPlan,
						originalsLimitBytes: planResult.originalsLimitBytes,
						finalsLimitBytes: planResult.finalsLimitBytes,
						uploadedSizeBytes: planResult.uploadedSizeBytes,
						selectionEnabled: planResult.selectionEnabled,
						usagePercentage: planResult.usagePercentage,
						isNearCapacity: planResult.isNearCapacity,
						isAtCapacity: planResult.isAtCapacity,
						exceedsLargestPlan: planResult.exceedsLargestPlan,
						nextTierPlan: planResult.nextTierPlan,
					});
					setIsProcessingPayment(false);
					return;
				} catch (calcError) {
					showToast('error', 'Błąd', 'Nie udało się obliczyć planu. Spróbuj ponownie.');
					setIsProcessingPayment(false);
					return;
				}
			}

			// Proceed with payment if plan already exists
			const paymentResult = await api.galleries.pay(galleryId, {});
			
			if (paymentResult.checkoutUrl) {
				// Redirect to Stripe checkout
				window.location.href = paymentResult.checkoutUrl;
			} else if (paymentResult.paid) {
				// Already paid or paid via wallet
				showToast('success', 'Sukces', 'Galeria została opłacona!');
				onPaymentComplete?.();
			} else {
				showToast('error', 'Błąd', 'Nie udało się przetworzyć płatności.');
			}
		} catch (error) {
			showToast('error', 'Błąd', formatApiError(error));
		} finally {
			setIsProcessingPayment(false);
		}
	};

	const handleTopUpWallet = () => {
		router.push('/wallet');
	};

	const priceCents = gallery.priceCents || 0;
	const walletAmount = walletBalance || 0;
	const remainingAmount = Math.max(0, priceCents - walletAmount);
	const canPayWithWallet = walletAmount >= priceCents;
	const savingsCents = walletAmount > 0 ? Math.min(walletAmount, priceCents) : 0;

	if (isMinimized) {
		return (
			<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-yellow-600 font-semibold">Galeria wymaga płatności</span>
						<span className="text-sm text-gray-600">({formatPrice(priceCents)})</span>
					</div>
					<button
						onClick={() => setIsMinimized(false)}
						className="text-yellow-600 hover:text-yellow-700 text-sm underline"
					>
						Rozwiń
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 mb-6 shadow-lg">
			<div className="flex items-start justify-between mb-4">
				<div className="flex-1">
					<h3 className="text-xl font-bold text-gray-900 mb-2">
						Opłać galerię, aby kontynuować
					</h3>
					<p className="text-sm text-gray-600 mb-4">
						Twoja galeria jest w stanie DRAFT. Opłać plan, aby móc korzystać z pełnej funkcjonalności.
					</p>
				</div>
				<button
					onClick={() => setIsMinimized(true)}
					className="text-gray-400 hover:text-gray-600 ml-4"
					aria-label="Minimalizuj"
				>
					<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{/* Payment Amount */}
			<div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
				<div className="flex items-center justify-between mb-2">
					<span className="text-lg font-semibold text-gray-900">Kwota do zapłaty:</span>
					<span className="text-2xl font-bold text-blue-600">{formatPrice(priceCents)}</span>
				</div>

				{/* Plan Details */}
				{gallery.plan && (
					<div className="mt-3 pt-3 border-t border-gray-200">
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<span className="text-gray-600">Plan:</span>
								<span className="ml-2 font-medium">{gallery.plan}</span>
							</div>
							<div>
								<span className="text-gray-600">Typ galerii:</span>
								<span className="ml-2 font-medium">
									{gallery.selectionEnabled !== false ? 'Z selekcją' : 'Bez selekcji'}
									{gallery.selectionEnabled === false && (
										<span className="text-green-600 ml-1">(zniżka 20%)</span>
									)}
								</span>
							</div>
							{gallery.originalsLimitBytes && (
								<div>
									<span className="text-gray-600">Limit oryginałów:</span>
									<span className="ml-2 font-medium">{formatBytes(gallery.originalsLimitBytes)}</span>
								</div>
							)}
							{gallery.finalsLimitBytes && (
								<div>
									<span className="text-gray-600">Limit finalnych:</span>
									<span className="ml-2 font-medium">{formatBytes(gallery.finalsLimitBytes)}</span>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Wallet Balance */}
			{!isLoadingWallet && walletBalance !== null && (
				<div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm text-gray-600">Saldo portfela:</span>
						<span className="text-lg font-semibold text-gray-900">{formatPrice(walletAmount)}</span>
					</div>
					{walletAmount > 0 && (
						<div className="mt-2">
							{savingsCents > 0 && (
								<p className="text-sm text-green-600 font-medium">
									Możesz zaoszczędzić {formatPrice(savingsCents)} używając portfela
								</p>
							)}
							{remainingAmount > 0 && (
								<p className="text-sm text-gray-600 mt-1">
									Pozostało do zapłaty: <span className="font-medium">{formatPrice(remainingAmount)}</span>
								</p>
							)}
						</div>
					)}
				</div>
			)}

			{/* Next Steps */}
			<div className="bg-blue-100 rounded-lg p-4 mb-4">
				<p className="text-sm font-medium text-blue-900 mb-2">Następne kroki:</p>
				<ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
					<li>Opłać plan galerii, aby aktywować pełną funkcjonalność</li>
					{walletAmount < priceCents && (
						<li>
							<span className="font-medium">Opcjonalnie:</span> Doładuj portfel, aby zaoszczędzić na opłatach transakcyjnych
						</li>
					)}
					<li>Po opłaceniu będziesz mógł korzystać z galerii bez ograniczeń</li>
				</ol>
			</div>

			{/* Action Buttons */}
			<div className="flex flex-col sm:flex-row gap-3">
				{walletAmount < priceCents && (
					<Button
						variant="secondary"
						onClick={handleTopUpWallet}
						className="flex-1"
					>
						Doładuj portfel
					</Button>
				)}
				<Button
					variant="primary"
					onClick={handlePayNow}
					disabled={isProcessingPayment}
					className="flex-1"
				>
					{isProcessingPayment ? 'Przetwarzanie...' : canPayWithWallet ? 'Opłać z portfela' : 'Opłać teraz'}
				</Button>
			</div>

			{/* Pricing Modal */}
			{pricingModalData && (
				<GalleryPricingModal
					isOpen={!!pricingModalData}
					onClose={() => {
						setPricingModalData(null);
					}}
					galleryId={galleryId}
					suggestedPlan={pricingModalData.suggestedPlan}
					originalsLimitBytes={pricingModalData.originalsLimitBytes}
					finalsLimitBytes={pricingModalData.finalsLimitBytes}
					uploadedSizeBytes={pricingModalData.uploadedSizeBytes}
					selectionEnabled={pricingModalData.selectionEnabled}
					onPlanSelected={() => {
						setPricingModalData(null);
						onPaymentComplete?.();
					}}
				/>
			)}
		</div>
	);
};

