export interface EmailTemplate {
	subject: string;
	text: string;
	html?: string;
}

export function createSelectionLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `Access your gallery: ${galleryName || galleryId}`,
		text: `Hello,\n\nYou've been invited to view and select photos from ${galleryName || galleryId}.\n\nAccess your gallery: ${link}\n\nPlease use the password provided by your photographer.`,
		html: `<h2>Hello,</h2><p>You've been invited to view and select photos from <strong>${galleryName || galleryId}</strong>.</p><p><a href="${link}">Access your gallery</a></p><p>Please use the password provided by your photographer.</p>`
	};
}

export function createSelectionStartedEmail(galleryId: string, clientId: string, selectedCount: number): EmailTemplate {
	return {
		subject: `Client started selecting photos - Gallery ${galleryId}`,
		text: `Client ${clientId} has started selecting photos for gallery ${galleryId}.\n\nSelected so far: ${selectedCount} photos.\n\nView the gallery in your dashboard.`,
		html: `<h2>Client Selection Started</h2><p>Client <strong>${clientId}</strong> has started selecting photos for gallery <strong>${galleryId}</strong>.</p><p>Selected so far: <strong>${selectedCount}</strong> photos.</p><p>View the gallery in your dashboard.</p>`
	};
}

export function createSelectionApprovedEmail(
	galleryId: string,
	clientId: string,
	selectedCount: number,
	overageCount: number,
	overageCents: number,
	orderId: string
): EmailTemplate {
	const overagePLN = (overageCents / 100).toFixed(2);
	return {
		subject: `Selections approved - Gallery ${galleryId} - Order ${orderId}`,
		text: `Client ${clientId} approved selections for gallery ${galleryId}.\n\nSelected: ${selectedCount} photos\nOverage: ${overageCount} photos (${overagePLN} PLN)\nOrder ID: ${orderId}\n\nProcess the order and upload final photos.`,
		html: `<h2>Selections Approved</h2><p>Client <strong>${clientId}</strong> approved selections for gallery <strong>${galleryId}</strong>.</p><ul><li>Selected: <strong>${selectedCount}</strong> photos</li><li>Overage: <strong>${overageCount}</strong> photos (<strong>${overagePLN} PLN</strong>)</li><li>Order ID: <strong>${orderId}</strong></li></ul><p>Process the order and upload final photos.</p>`
	};
}

export function createFinalLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `Your photos are ready: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour photos from ${galleryName || galleryId} are ready!\n\nView and download: ${link}\n\nThank you for choosing us!`,
		html: `<h2>Your Photos Are Ready!</h2><p>Your photos from <strong>${galleryName || galleryId}</strong> are ready.</p><p><a href="${link}">View and download your photos</a></p><p>Thank you for choosing us!</p>`
	};
}

export function createFinalLinkEmailWithPasswordInfo(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `Your photos are ready: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour photos from ${galleryName || galleryId} are ready!\n\nView and download: ${link}\n\nYour gallery password will be sent to you in a separate email for security reasons.\n\nThank you for choosing us!`,
		html: `<h2>Your Photos Are Ready!</h2><p>Your photos from <strong>${galleryName || galleryId}</strong> are ready.</p><p><a href="${link}">View and download your photos</a></p><p><strong>Important:</strong> Your gallery password will be sent to you in a separate email for security reasons.</p><p>Thank you for choosing us!</p>`
	};
}

export function createChangeRequestEmail(galleryId: string, clientId: string): EmailTemplate {
	return {
		subject: `Change request - Gallery ${galleryId}`,
		text: `Client ${clientId} has requested changes to their selection for gallery ${galleryId}.\n\nPlease review and approve the change request in your dashboard.`,
		html: `<h2>Change Request</h2><p>Client <strong>${clientId}</strong> has requested changes to their selection for gallery <strong>${galleryId}</strong>.</p><p>Please review and approve the change request in your dashboard.</p>`
	};
}

export function createChangeRequestApprovedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `Change request approved - ${galleryName || galleryId}`,
		text: `Hello,\n\nYour change request for gallery ${galleryName || galleryId} has been approved!\n\nYou can now modify your selection.\n\nAccess your gallery: ${link}\n\nPlease log in and make your changes. Once you're satisfied with your selection, you can approve it again.`,
		html: `<h2>Change Request Approved!</h2><p>Your change request for gallery <strong>${galleryName || galleryId}</strong> has been approved!</p><p>You can now modify your selection.</p><p><a href="${link}">Access your gallery</a></p><p>Please log in and make your changes. Once you're satisfied with your selection, you can approve it again.</p>`
	};
}

export function createChangeRequestDeniedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string, reason?: string): EmailTemplate {
	const reasonSection = reason 
		? `\n\nReason: ${reason}`
		: '';
	
	// Escape HTML characters in reason to prevent XSS
	const escapeHtml = (text: string) => {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	};
	
	const reasonHtmlSection = reason
		? `<div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #dc3545; border-radius: 4px;"><p style="margin: 0; font-weight: bold; color: #333;">Powód:</p><p style="margin: 5px 0 0 0; color: #666; white-space: pre-wrap;">${escapeHtml(reason).replace(/\n/g, '<br>')}</p></div>`
		: '';
	
	return {
		subject: `Change request - ${galleryName || galleryId}`,
		text: `Hello,\n\nThank you for your change request for gallery ${galleryName || galleryId}.\n\nAfter reviewing your request, we're unable to make changes at this time. Your current selection remains approved and we'll proceed with processing your photos as selected.${reasonSection}\n\nIf you have any questions or concerns, please contact your photographer.\n\nView your gallery: ${link}`,
		html: `<h2>Change Request</h2><p>Thank you for your change request for gallery <strong>${galleryName || galleryId}</strong>.</p><p>After reviewing your request, we're unable to make changes at this time. Your current selection remains approved and we'll proceed with processing your photos as selected.</p>${reasonHtmlSection}<p>If you have any questions or concerns, please contact your photographer.</p><p><a href="${link}">View your gallery</a></p>`
	};
}

export function createExpiryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, daysRemaining: number, link: string): EmailTemplate {
	return {
		subject: `Gallery expiring soon: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour gallery ${galleryName || galleryId} will expire in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.\n\nAccess it now: ${link}`,
		html: `<h2>Gallery Expiring Soon</h2><p>Your gallery <strong>${galleryName || galleryId}</strong> will expire in <strong>${daysRemaining}</strong> day${daysRemaining !== 1 ? 's' : ''}.</p><p><a href="${link}">Access your gallery now</a></p>`
	};
}

export function createGalleryInvitationEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `You've been invited to select photos: ${galleryName || galleryId}`,
		text: `Hello,\n\nYou've been invited to view and select photos from ${galleryName || galleryId}.\n\nAccess your gallery: ${link}\n\nYour gallery password will be sent to you in a separate email for security reasons.\n\nPlease use the password provided by your photographer to access the gallery.`,
		html: `<h2>You've Been Invited!</h2><p>You've been invited to view and select photos from <strong>${galleryName || galleryId}</strong>.</p><p><a href="${link}">Access your gallery</a></p><p><strong>Important:</strong> Your gallery password will be sent to you in a separate email for security reasons.</p><p>Please use the password provided by your photographer to access the gallery.</p>`
	};
}

export function createGalleryPasswordEmail(galleryId: string, galleryName: string, clientEmail: string, password: string, link: string): EmailTemplate {
	return {
		subject: `Your gallery password: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour gallery password for ${galleryName || galleryId}:\n\nPassword: ${password}\n\nAccess your gallery: ${link}\n\nPlease keep this password secure. If you didn't expect this email, please contact your photographer.`,
		html: `<h2>Your Gallery Password</h2><p>Your gallery password for <strong>${galleryName || galleryId}</strong>:</p><p style="font-size: 18px; font-weight: bold; padding: 12px; background: #f5f5f5; border-radius: 4px; display: inline-block;">${password}</p><p><a href="${link}">Access your gallery</a></p><p><small>Please keep this password secure. If you didn't expect this email, please contact your photographer.</small></p>`
	};
}

export function createGalleryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	return {
		subject: `Reminder: Access your gallery - ${galleryName || galleryId}`,
		text: `Hello,\n\nThis is a reminder that your gallery ${galleryName || galleryId} is still available for viewing.\n\nAccess your gallery: ${link}\n\nYour gallery password will be sent to you in a separate email for security reasons.\n\nIf you have any questions, please contact your photographer.`,
		html: `<h2>Gallery Reminder</h2><p>This is a reminder that your gallery <strong>${galleryName || galleryId}</strong> is still available for viewing.</p><p><a href="${link}">Access your gallery</a></p><p><strong>Important:</strong> Your gallery password will be sent to you in a separate email for security reasons.</p><p>If you have any questions, please contact your photographer.</p>`
	};
}

export function createPasswordResetEmail(galleryId: string, galleryName: string, clientEmail: string, password: string, link: string): EmailTemplate {
	return {
		subject: `Your PhotoHub gallery password has been reset: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour gallery password for ${galleryName || galleryId} has been reset by your photographer.\n\nNew password: ${password}\n\nAccess your gallery: ${link}\n\nIf you didn't expect this email, please contact your photographer.`,
		html: `<h2>Password Reset</h2><p>Your gallery password for <strong>${galleryName || galleryId}</strong> has been reset by your photographer.</p><p style="font-size: 18px; font-weight: bold; padding: 12px; background: #f5f5f5; border-radius: 4px; display: inline-block;">New password: ${password}</p><p><a href="${link}">Access your gallery</a></p><p><small>If you didn't expect this email, please contact your photographer.</small></p>`
	};
}

export function createExpiryWarningEmail(galleryId: string, galleryName: string, daysRemaining: number, link: string): EmailTemplate {
	return {
		subject: `⚠️ Gallery expiring in ${daysRemaining} days: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour gallery "${galleryName || galleryId}" will expire in ${daysRemaining} days.\n\n⚠️ IMPORTANT: All photos will be permanently deleted when the gallery expires. This is your last chance to download any photos you need.\n\nAccess your gallery now: ${link}\n\nPlease download any photos you want to keep before the expiry date. Once deleted, photos cannot be recovered.`,
		html: `<h2>⚠️ Gallery Expiring Soon</h2><p>Your gallery <strong>${galleryName || galleryId}</strong> will expire in <strong>${daysRemaining}</strong> days.</p><div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 16px 0;"><p style="margin: 0; font-weight: bold;">⚠️ IMPORTANT: All photos will be permanently deleted when the gallery expires.</p><p style="margin: 8px 0 0 0;">This is your last chance to download any photos you need. Once deleted, photos cannot be recovered.</p></div><p><a href="${link}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Access Your Gallery Now</a></p><p><small>Please download any photos you want to keep before the expiry date.</small></p>`
	};
}

export function createExpiryFinalWarningEmail(galleryId: string, galleryName: string, link: string): EmailTemplate {
	return {
		subject: `🚨 URGENT: Gallery expiring in 24 hours - ${galleryName || galleryId}`,
		text: `Hello,\n\nURGENT: Your gallery "${galleryName || galleryId}" will expire in 24 hours.\n\n🚨 CRITICAL: All photos will be permanently deleted in 24 hours. This is your FINAL opportunity to download any photos.\n\nAccess your gallery immediately: ${link}\n\nPlease download any photos you want to keep NOW. Once deleted, photos cannot be recovered.`,
		html: `<h2>🚨 URGENT: Gallery Expiring in 24 Hours</h2><p>Your gallery <strong>${galleryName || galleryId}</strong> will expire in <strong>24 hours</strong>.</p><div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 12px; margin: 16px 0;"><p style="margin: 0; font-weight: bold; color: #721c24;">🚨 CRITICAL: All photos will be permanently deleted in 24 hours.</p><p style="margin: 8px 0 0 0; color: #721c24;">This is your FINAL opportunity to download any photos. Once deleted, photos cannot be recovered.</p></div><p><a href="${link}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Download Photos Now</a></p><p><small>Please download any photos you want to keep immediately.</small></p>`
	};
}

export function createGalleryDeletedEmail(galleryId: string, galleryName: string, deletionSummary?: { s3ObjectsDeleted?: number }): EmailTemplate {
	const summaryText = deletionSummary?.s3ObjectsDeleted 
		? `\n\nDeletion Summary:\n- S3 objects deleted: ${deletionSummary.s3ObjectsDeleted}`
		: '';
	const summaryHtml = deletionSummary?.s3ObjectsDeleted
		? `<div style="background: #f5f5f5; padding: 12px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0;"><strong>Deletion Summary:</strong></p><ul style="margin: 8px 0 0 0;"><li>S3 objects deleted: ${deletionSummary.s3ObjectsDeleted}</li></ul></div>`
		: '';

	return {
		subject: `Gallery deleted: ${galleryName || galleryId}`,
		text: `Hello,\n\nYour gallery "${galleryName || galleryId}" has been permanently deleted.${summaryText}\n\nAll photos, previews, thumbnails, and related data have been removed from our system.\n\nIf you need to recover any photos, please contact your photographer.`,
		html: `<h2>Gallery Deleted</h2><p>Your gallery <strong>${galleryName || galleryId}</strong> has been permanently deleted.${summaryHtml}</p><p>All photos, previews, thumbnails, and related data have been removed from our system.</p><p><small>If you need to recover any photos, please contact your photographer.</small></p>`
	};
}

