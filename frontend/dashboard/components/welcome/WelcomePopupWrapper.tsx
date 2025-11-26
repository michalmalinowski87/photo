import { useState, useEffect } from 'react';
import { WelcomePopup } from './WelcomePopup';
import api from '../../lib/api-service';
import { initializeAuth } from '../../lib/auth-init';

const WELCOME_POPUP_SEEN_KEY = 'photohub_welcome_popup_seen';

export const WelcomePopupWrapper: React.FC = () => {
	const [showPopup, setShowPopup] = useState(false);
	const [welcomeBonusCents, setWelcomeBonusCents] = useState(900); // Default to 9 PLN (900 cents)
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		// Only check on client side
		if (typeof window === 'undefined') {
			return;
		}

		// Check if user has already seen the popup
		const hasSeenPopup = localStorage.getItem(WELCOME_POPUP_SEEN_KEY);
		if (hasSeenPopup === 'true') {
			setChecking(false);
			return;
		}

		// Check for welcome bonus on mount
		const checkWelcomeBonus = () => {
			// Initialize auth - this is async with callbacks
			initializeAuth(
				async () => {
					// Auth successful, check for welcome bonus
					try {
						// Load wallet balance (this triggers welcome bonus if user is new)
						const balanceData = await api.wallet.getBalance();
						
						// Small delay to ensure welcome bonus transaction is created
						await new Promise(resolve => setTimeout(resolve, 500));
						
						// Check if user has welcome bonus transaction
						try {
							const transactionsData = await api.wallet.getTransactions({ limit: '10' });
							const transactions = transactionsData.transactions || [];
							
							// Find WELCOME_BONUS transaction
							const welcomeBonusTransaction = transactions.find(
								(tx: any) => tx.type === 'WELCOME_BONUS'
							);

							if (welcomeBonusTransaction) {
								// User has welcome bonus, show popup
								const bonusAmount = welcomeBonusTransaction.amountCents || 
									(welcomeBonusTransaction.amount ? welcomeBonusTransaction.amount * 100 : 0) || 
									900;
								setWelcomeBonusCents(bonusAmount);
								setShowPopup(true);
							}
						} catch (txErr) {
							// If we can't fetch transactions, don't show popup
							console.error('Failed to fetch transactions:', txErr);
						}
					} catch (err) {
						// Error fetching wallet - don't show popup
						console.error('Welcome popup check failed:', err);
					} finally {
						setChecking(false);
					}
				},
				() => {
					// Not authenticated - don't show popup
					setChecking(false);
				}
			);
		};

		checkWelcomeBonus();
	}, []);

	const handleClose = () => {
		setShowPopup(false);
		// Mark popup as seen
		if (typeof window !== 'undefined') {
			localStorage.setItem(WELCOME_POPUP_SEEN_KEY, 'true');
		}
	};

	// Don't render anything while checking or if popup shouldn't be shown
	if (checking || !showPopup) {
		return null;
	}

	return (
		<WelcomePopup
			isOpen={showPopup}
			onClose={handleClose}
			welcomeBonusCents={welcomeBonusCents}
		/>
	);
};

