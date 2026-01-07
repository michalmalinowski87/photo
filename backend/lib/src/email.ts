export interface EmailTemplate {
	subject: string;
	text: string;
	html?: string;
}

// Design system colors matching Photo Hub dashboard
const COLORS = {
	// Primary accent color (photographer-accent) - used in light theme
	primary: {
		500: '#8B6F57', // photographer-accent
		600: '#7A5F4A', // photographer-accentHover
		700: '#554334', // photographer-accentDark
		50: '#D2B79A',  // photographer-accentLight
	},
	success: {
		500: '#12b76a',
		50: '#ecfdf3',
	},
	error: {
		500: '#f04438',
		50: '#fef3f2',
	},
	warning: {
		500: '#f79009',
		50: '#fffaeb',
	},
	blueLight: {
		500: '#0ba5ec',
		50: '#f0f9ff',
	},
	gray: {
		50: '#f9fafb',
		100: '#f2f4f7',
		200: '#e4e7ec',
		300: '#d0d5dd',
		400: '#98a2b3',
		500: '#667085',
		700: '#344054',
		900: '#101828',
	},
};

// Helper function to escape HTML
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Email wrapper with header and footer
function createEmailWrapper(content: string): string {
	return `<!DOCTYPE html>
<html lang="pl">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<title>PhotoCloud</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${COLORS.gray[50]};">
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.gray[50]};">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0px 1px 3px 0px rgba(16, 24, 40, 0.1);">
					<!-- Header -->
					<tr>
						<td style="padding: 32px 40px 24px; border-bottom: 1px solid ${COLORS.gray[200]};">
							<h1 style="margin: 0; font-size: 24px; font-weight: 700; color: ${COLORS.gray[900]}; letter-spacing: -0.02em;">PhotoCloud</h1>
						</td>
					</tr>
					<!-- Content -->
					<tr>
						<td style="padding: 32px 40px;">
							${content}
						</td>
					</tr>
					<!-- Footer -->
					<tr>
						<td style="padding: 24px 40px; border-top: 1px solid ${COLORS.gray[200]}; background-color: ${COLORS.gray[50]};">
							<p style="margin: 0; font-size: 14px; color: ${COLORS.gray[500]}; line-height: 1.5;">
								Zespół PhotoCloud<br>
								<small style="color: ${COLORS.gray[400]};">Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten e-mail.</small>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

// Button component
function createButton(text: string, href: string, variant: 'primary' | 'success' | 'error' | 'warning' = 'primary'): string {
	const colors = {
		primary: COLORS.primary[500], // photographer-accent
		success: COLORS.success[500],
		error: COLORS.error[500],
		warning: COLORS.warning[500],
	};
	const bgColor = colors[variant];
	
	return `
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
			<tr>
				<td align="center">
					<a href="${escapeHtml(href)}" style="display: inline-block; padding: 14px 28px; background-color: ${bgColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; line-height: 1.5;">${escapeHtml(text)}</a>
				</td>
			</tr>
		</table>
	`;
}

// Alert component
function createAlert(content: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): string {
	const styles = {
		success: {
			bg: COLORS.success[50],
			border: COLORS.success[500],
			text: '#027a48',
		},
		error: {
			bg: COLORS.error[50],
			border: COLORS.error[500],
			text: '#b42318',
		},
		warning: {
			bg: COLORS.warning[50],
			border: COLORS.warning[500],
			text: '#b54708',
		},
		info: {
			bg: COLORS.blueLight[50],
			border: COLORS.blueLight[500],
			text: '#026aa2',
		},
	};
	const style = styles[type];
	
	return `
		<div style="background-color: ${style.bg}; border-left: 4px solid ${style.border}; padding: 16px; margin: 24px 0; border-radius: 6px;">
			<div style="color: ${style.text}; font-size: 14px; line-height: 1.6;">
				${content}
			</div>
		</div>
	`;
}

// Heading component
function createHeading(text: string, level: 1 | 2 = 2): string {
	const size = level === 1 ? '28px' : '24px';
	return `<h${level} style="margin: 0 0 16px 0; font-size: ${size}; font-weight: 700; color: ${COLORS.gray[900]}; line-height: 1.3; letter-spacing: -0.02em;">${escapeHtml(text)}</h${level}>`;
}

// Paragraph component
function createParagraph(text: string, style?: string): string {
	const customStyle = style ? ` ${style}` : '';
	return `<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.gray[700]}; line-height: 1.6;${customStyle}">${escapeHtml(text)}</p>`;
}

// Small text component
function createSmallText(text: string): string {
	return `<p style="margin: 0; font-size: 14px; color: ${COLORS.gray[500]}; line-height: 1.5;">${escapeHtml(text)}</p>`;
}

export function createSelectionLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Witaj!', 2)}
		${createParagraph(`Zostałeś zaproszony do przeglądania i wyboru zdjęć z galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
		${createButton('Otwórz galerię', link)}
		${createParagraph('Prosimy użyć hasła dostarczonego przez Twojego fotografa.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Dostęp do galerii: ${galleryDisplayName}`,
		text: `Witaj,\n\nZostałeś zaproszony do przeglądania i wyboru zdjęć z galerii ${galleryDisplayName}.\n\nDostęp do galerii: ${link}\n\nProsimy użyć hasła dostarczonego przez Twojego fotografa.`,
		html: createEmailWrapper(content)
	};
}

export function createSelectionStartedEmail(galleryId: string, clientId: string, selectedCount: number): EmailTemplate {
	const content = `
		${createHeading('Klient rozpoczął wybór zdjęć', 2)}
		${createParagraph(`Klient <strong>${escapeHtml(clientId)}</strong> rozpoczął wybór zdjęć dla galerii <strong>${escapeHtml(galleryId)}</strong>.`)}
		<div style="background-color: ${COLORS.blueLight[50]}; border-left: 4px solid ${COLORS.blueLight[500]}; padding: 16px; margin: 24px 0; border-radius: 6px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.gray[900]};">
				<strong>Wybrano dotychczas:</strong> <span style="font-size: 20px; font-weight: 700; color: ${COLORS.blueLight[500]};">${selectedCount}</span> zdjęć
			</p>
		</div>
		${createParagraph('Zobacz galerię w swoim panelu, aby śledzić postęp wyboru.')}
	`;
	
	return {
		subject: `Klient rozpoczął wybór zdjęć - Galeria ${galleryId}`,
		text: `Klient ${clientId} rozpoczął wybór zdjęć dla galerii ${galleryId}.\n\nWybrano dotychczas: ${selectedCount} zdjęć.\n\nZobacz galerię w swoim panelu.`,
		html: createEmailWrapper(content)
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
	const content = `
		${createHeading('Wybór zdjęć został zatwierdzony', 2)}
		${createParagraph(`Klient <strong>${escapeHtml(clientId)}</strong> zatwierdził wybór zdjęć dla galerii <strong>${escapeHtml(galleryId)}</strong>.`)}
		<div style="background-color: ${COLORS.success[50]}; border-left: 4px solid ${COLORS.success[500]}; padding: 16px; margin: 24px 0; border-radius: 6px;">
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.gray[900]}; font-size: 14px; line-height: 1.8;">
				<li><strong>Wybrano:</strong> ${selectedCount} zdjęć</li>
				<li><strong>Nadwyżka:</strong> ${overageCount} zdjęć (<strong>${overagePLN} PLN</strong>)</li>
				<li><strong>Numer zamówienia:</strong> ${escapeHtml(orderId)}</li>
			</ul>
		</div>
		${createParagraph('Przetwórz zamówienie i prześlij finalne zdjęcia.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Wybór zdjęć zatwierdzony - Galeria ${galleryId} - Zamówienie ${orderId}`,
		text: `Klient ${clientId} zatwierdził wybór zdjęć dla galerii ${galleryId}.\n\nWybrano: ${selectedCount} zdjęć\nNadwyżka: ${overageCount} zdjęć (${overagePLN} PLN)\nNumer zamówienia: ${orderId}\n\nPrzetwórz zamówienie i prześlij finalne zdjęcia.`,
		html: createEmailWrapper(content)
	};
}

export function createFinalLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Twoje zdjęcia są gotowe!', 2)}
		${createParagraph(`Zdjęcia z galerii <strong>${escapeHtml(galleryDisplayName)}</strong> są już gotowe do pobrania.`)}
		${createButton('Zobacz i pobierz zdjęcia', link, 'success')}
		${createParagraph('Dziękujemy za wybór naszych usług!', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Twoje zdjęcia są gotowe: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoje zdjęcia z galerii ${galleryDisplayName} są gotowe!\n\nZobacz i pobierz: ${link}\n\nDziękujemy za wybór naszych usług!`,
		html: createEmailWrapper(content)
	};
}

export function createFinalLinkEmailWithPasswordInfo(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Twoje zdjęcia są gotowe!', 2)}
		${createParagraph(`Zdjęcia z galerii <strong>${escapeHtml(galleryDisplayName)}</strong> są już gotowe do pobrania.`)}
		${createButton('Zobacz i pobierz zdjęcia', link, 'success')}
		${createAlert('<strong>Ważne:</strong> Hasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.', 'info')}
		${createParagraph('Dziękujemy za wybór naszych usług!', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Twoje zdjęcia są gotowe: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoje zdjęcia z galerii ${galleryDisplayName} są gotowe!\n\nZobacz i pobierz: ${link}\n\nHasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.\n\nDziękujemy za wybór naszych usług!`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestEmail(galleryId: string, clientId: string): EmailTemplate {
	const content = `
		${createHeading('Prośba o zmianę wyboru', 2)}
		${createParagraph(`Klient <strong>${escapeHtml(clientId)}</strong> złożył prośbę o zmianę wyboru zdjęć dla galerii <strong>${escapeHtml(galleryId)}</strong>.`)}
		${createAlert('Prosimy przejrzeć i zatwierdzić prośbę o zmianę w swoim panelu.', 'info')}
		${createParagraph('Zaloguj się do panelu, aby zobaczyć szczegóły prośby i podjąć decyzję.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Prośba o zmianę - Galeria ${galleryId}`,
		text: `Klient ${clientId} złożył prośbę o zmianę wyboru zdjęć dla galerii ${galleryId}.\n\nProsimy przejrzeć i zatwierdzić prośbę o zmianę w swoim panelu.`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestApprovedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Prośba o zmianę została zatwierdzona!', 2)}
		${createParagraph(`Twoja prośba o zmianę wyboru zdjęć dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong> została zatwierdzona!`)}
		${createAlert('Możesz teraz zmodyfikować swój wybór zdjęć.', 'success')}
		${createButton('Otwórz galerię', link, 'success')}
		${createParagraph('Zaloguj się i wprowadź zmiany. Gdy będziesz zadowolony z wyboru, możesz ponownie go zatwierdzić.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Prośba o zmianę zatwierdzona - ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoja prośba o zmianę wyboru zdjęć dla galerii ${galleryDisplayName} została zatwierdzona!\n\nMożesz teraz zmodyfikować swój wybór.\n\nDostęp do galerii: ${link}\n\nZaloguj się i wprowadź zmiany. Gdy będziesz zadowolony z wyboru, możesz ponownie go zatwierdzić.`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestDeniedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string, reason?: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const reasonSection = reason 
		? `\n\nPowód: ${reason}`
		: '';
	
	const reasonHtmlSection = reason
		? `<div style="background-color: ${COLORS.error[50]}; border-left: 4px solid ${COLORS.error[500]}; padding: 16px; margin: 24px 0; border-radius: 6px;">
			<p style="margin: 0 0 8px 0; font-weight: 600; color: ${COLORS.gray[900]}; font-size: 14px;">Powód:</p>
			<p style="margin: 0; color: ${COLORS.gray[700]}; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(reason).replace(/\n/g, '<br>')}</p>
		</div>`
		: '';
	
	const content = `
		${createHeading('Prośba o zmianę', 2)}
		${createParagraph(`Dziękujemy za prośbę o zmianę wyboru zdjęć dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
		${createParagraph('Po przejrzeniu Twojej prośby nie możemy w tym momencie wprowadzić zmian. Twój obecny wybór pozostaje zatwierdzony i będziemy przetwarzać zdjęcia zgodnie z wybranymi.')}
		${reasonHtmlSection}
		${createParagraph('Jeśli masz pytania lub wątpliwości, skontaktuj się ze swoim fotografem.', 'margin-top: 24px;')}
		${createButton('Zobacz galerię', link)}
	`;
	
	return {
		subject: `Prośba o zmianę - ${galleryDisplayName}`,
		text: `Witaj,\n\nDziękujemy za prośbę o zmianę wyboru zdjęć dla galerii ${galleryDisplayName}.\n\nPo przejrzeniu Twojej prośby nie możemy w tym momencie wprowadzić zmian. Twój obecny wybór pozostaje zatwierdzony i będziemy przetwarzać zdjęcia zgodnie z wybranymi.${reasonSection}\n\nJeśli masz pytania lub wątpliwości, skontaktuj się ze swoim fotografem.\n\nZobacz galerię: ${link}`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, daysRemaining: number, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const daysText = daysRemaining === 1 ? 'dzień' : daysRemaining < 5 ? 'dni' : 'dni';
	const content = `
		${createHeading('Galeria wkrótce wygaśnie', 2)}
		${createParagraph(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>${daysRemaining}</strong> ${daysText}.`)}
		${createAlert('Pamiętaj, aby pobrać wszystkie zdjęcia przed wygaśnięciem galerii.', 'warning')}
		${createButton('Otwórz galerię', link)}
	`;
	
	return {
		subject: `Galeria wkrótce wygaśnie: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoja galeria ${galleryDisplayName} wygaśnie za ${daysRemaining} ${daysText}.\n\nOtwórz galerię: ${link}`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryInvitationEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Zostałeś zaproszony!', 2)}
		${createParagraph(`Zostałeś zaproszony do przeglądania i wyboru zdjęć z galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
		${createButton('Otwórz galerię', link)}
		${createAlert('<strong>Ważne:</strong> Hasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.', 'info')}
		${createParagraph('Prosimy użyć hasła dostarczonego przez Twojego fotografa, aby uzyskać dostęp do galerii.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Zaproszenie do wyboru zdjęć: ${galleryDisplayName}`,
		text: `Witaj,\n\nZostałeś zaproszony do przeglądania i wyboru zdjęć z galerii ${galleryDisplayName}.\n\nDostęp do galerii: ${link}\n\nHasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.\n\nProsimy użyć hasła dostarczonego przez Twojego fotografa, aby uzyskać dostęp do galerii.`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryPasswordEmail(galleryId: string, galleryName: string, clientEmail: string, password: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Hasło do galerii', 2)}
		${createParagraph(`Hasło do galerii <strong>${escapeHtml(galleryDisplayName)}</strong>:`)}
		<div style="background-color: ${COLORS.gray[100]}; border: 1px solid ${COLORS.gray[200]}; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
			<p style="margin: 0; font-size: 20px; font-weight: 700; color: ${COLORS.gray[900]}; font-family: 'Courier New', monospace; letter-spacing: 2px;">${escapeHtml(password)}</p>
		</div>
		${createButton('Otwórz galerię', link)}
		${createSmallText('Prosimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.')}
	`;
	
	return {
		subject: `Hasło do galerii: ${galleryDisplayName}`,
		text: `Witaj,\n\nHasło do galerii ${galleryDisplayName}:\n\nHasło: ${password}\n\nDostęp do galerii: ${link}\n\nProsimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Przypomnienie o galerii', 2)}
		${createParagraph(`To przypomnienie, że Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> jest nadal dostępna do przeglądania.`)}
		${createButton('Otwórz galerię', link)}
		${createAlert('<strong>Ważne:</strong> Hasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.', 'info')}
		${createParagraph('Jeśli masz pytania, skontaktuj się ze swoim fotografem.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Przypomnienie: Dostęp do Twojej galerii - ${galleryDisplayName}`,
		text: `Witaj,\n\nTo przypomnienie, że Twoja galeria ${galleryDisplayName} jest nadal dostępna do przeglądania.\n\nDostęp do galerii: ${link}\n\nHasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.\n\nJeśli masz pytania, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createPasswordResetEmail(galleryId: string, galleryName: string, clientEmail: string, password: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('Hasło zostało zresetowane', 2)}
		${createParagraph(`Hasło do galerii <strong>${escapeHtml(galleryDisplayName)}</strong> zostało zresetowane przez Twojego fotografa.`)}
		<div style="background-color: ${COLORS.gray[100]}; border: 1px solid ${COLORS.gray[200]}; border-radius: 8px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 8px 0; font-size: 14px; color: ${COLORS.gray[500]}; font-weight: 600;">Nowe hasło:</p>
			<p style="margin: 0; font-size: 20px; font-weight: 700; color: ${COLORS.gray[900]}; font-family: 'Courier New', monospace; letter-spacing: 2px;">${escapeHtml(password)}</p>
		</div>
		${createButton('Otwórz galerię', link)}
		${createSmallText('Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.')}
	`;
	
	return {
		subject: `Hasło do galerii PhotoCloud zostało zresetowane: ${galleryDisplayName}`,
		text: `Witaj,\n\nHasło do galerii ${galleryDisplayName} zostało zresetowane przez Twojego fotografa.\n\nNowe hasło: ${password}\n\nDostęp do galerii: ${link}\n\nJeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryWarningEmail(galleryId: string, galleryName: string, daysRemaining: number, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const daysText = daysRemaining === 1 ? 'dzień' : daysRemaining < 5 ? 'dni' : 'dni';
	const content = `
		${createHeading('⚠️ Galeria wkrótce wygaśnie', 2)}
		${createParagraph(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>${daysRemaining}</strong> ${daysText}.`)}
		${createAlert('<strong>⚠️ WAŻNE:</strong> Wszystkie zdjęcia zostaną trwale usunięte po wygaśnięciu galerii. To Twoja ostatnia szansa na pobranie potrzebnych zdjęć. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.', 'warning')}
		${createButton('Otwórz galerię teraz', link, 'warning')}
		${createSmallText('Prosimy pobrać wszystkie zdjęcia, które chcesz zachować, przed datą wygaśnięcia.')}
	`;
	
	return {
		subject: `⚠️ Galeria wygaśnie za ${daysRemaining} ${daysText}: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoja galeria "${galleryDisplayName}" wygaśnie za ${daysRemaining} ${daysText}.\n\n⚠️ WAŻNE: Wszystkie zdjęcia zostaną trwale usunięte po wygaśnięciu galerii. To Twoja ostatnia szansa na pobranie potrzebnych zdjęć.\n\nOtwórz galerię teraz: ${link}\n\nProsimy pobrać wszystkie zdjęcia, które chcesz zachować, przed datą wygaśnięcia. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryFinalWarningEmail(galleryId: string, galleryName: string, link: string): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const content = `
		${createHeading('🚨 PILNE: Galeria wygaśnie za 24 godziny', 2)}
		${createParagraph(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>24 godziny</strong>.`)}
		${createAlert('<strong>🚨 KRYTYCZNE:</strong> Wszystkie zdjęcia zostaną trwale usunięte za 24 godziny. To Twoja OSTATNIA szansa na pobranie zdjęć. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.', 'error')}
		${createButton('Pobierz zdjęcia teraz', link, 'error')}
		${createSmallText('Prosimy pobrać wszystkie zdjęcia, które chcesz zachować, natychmiast.')}
	`;
	
	return {
		subject: `🚨 PILNE: Galeria wygaśnie za 24 godziny - ${galleryDisplayName}`,
		text: `Witaj,\n\nPILNE: Twoja galeria "${galleryDisplayName}" wygaśnie za 24 godziny.\n\n🚨 KRYTYCZNE: Wszystkie zdjęcia zostaną trwale usunięte za 24 godziny. To Twoja OSTATNIA szansa na pobranie zdjęć.\n\nOtwórz galerię natychmiast: ${link}\n\nProsimy pobrać wszystkie zdjęcia, które chcesz zachować, TERAZ. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryDeletedEmail(galleryId: string, galleryName: string, deletionSummary?: { s3ObjectsDeleted?: number }): EmailTemplate {
	const galleryDisplayName = galleryName || galleryId;
	const summaryText = deletionSummary?.s3ObjectsDeleted 
		? `\n\nPodsumowanie usunięcia:\n- Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}`
		: '';
	const summaryHtml = deletionSummary?.s3ObjectsDeleted
		? `<div style="background-color: ${COLORS.gray[100]}; border: 1px solid ${COLORS.gray[200]}; border-radius: 8px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 8px 0; font-weight: 600; color: ${COLORS.gray[900]}; font-size: 14px;">Podsumowanie usunięcia:</p>
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.gray[700]}; font-size: 14px; line-height: 1.6;">
				<li>Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}</li>
			</ul>
		</div>`
		: '';

	const content = `
		${createHeading('Galeria została usunięta', 2)}
		${createParagraph(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> została trwale usunięta.`)}
		${summaryHtml}
		${createParagraph('Wszystkie zdjęcia, podglądy, miniatury i powiązane dane zostały usunięte z naszego systemu.')}
		${createSmallText('Jeśli potrzebujesz odzyskać jakieś zdjęcia, skontaktuj się ze swoim fotografem.')}
	`;
	
	return {
		subject: `Galeria została usunięta: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoja galeria "${galleryDisplayName}" została trwale usunięta.${summaryText}\n\nWszystkie zdjęcia, podglądy, miniatury i powiązane dane zostały usunięte z naszego systemu.\n\nJeśli potrzebujesz odzyskać jakieś zdjęcia, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createDeletionRequestEmail(userEmail: string, undoLink: string, deletionDate: string): EmailTemplate {
	const deletionDateFormatted = new Date(deletionDate).toLocaleDateString('pl-PL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	const content = `
		${createHeading('Potwierdzenie prośby o usunięcie konta', 2)}
		${createParagraph('Witaj,')}
		${createParagraph('Otrzymaliśmy prośbę o usunięcie Twojego konta.')}
		${createAlert(`<strong>Data usunięcia konta:</strong> ${escapeHtml(deletionDateFormatted)}`, 'warning')}
		${createParagraph('Jeśli nie prosiłeś o usunięcie konta lub chcesz anulować tę operację, kliknij poniższy przycisk:')}
		${createButton('Anuluj usunięcie konta', undoLink, 'primary')}
		${createSmallText('Ten link będzie ważny do momentu usunięcia konta.')}
		<div style="background-color: ${COLORS.gray[100]}; border: 1px solid ${COLORS.gray[200]}; border-radius: 8px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 12px 0; font-weight: 600; color: ${COLORS.gray[900]}; font-size: 14px;">Konsekwencje usunięcia konta:</p>
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.gray[700]}; font-size: 14px; line-height: 1.8;">
				<li>Twoje konto, profil, galerie, zdjęcia, klienci i pakiety zostaną trwale usunięte</li>
				<li>Galerie klientów będą zachowane do momentu ich wygaśnięcia</li>
				<li>Dane finansowe (saldo portfela, transakcje i faktury) zostaną zachowane zgodnie z wymogami prawnymi</li>
			</ul>
		</div>
	`;
	
	return {
		subject: 'Potwierdzenie prośby o usunięcie konta',
		text: `Witaj,\n\nOtrzymaliśmy prośbę o usunięcie Twojego konta.\n\nTwoje konto zostanie usunięte: ${deletionDateFormatted}\n\nJeśli nie prosiłeś o usunięcie konta lub chcesz anulować tę operację, kliknij poniższy link:\n\n${undoLink}\n\nTen link będzie ważny do momentu usunięcia konta.\n\nKonsekwencje usunięcia konta:\n- Twoje konto, profil, galerie, zdjęcia, klienci i pakiety zostaną trwale usunięte\n- Galerie klientów będą zachowane do momentu ich wygaśnięcia\n- Dane finansowe (saldo portfela, transakcje i faktury) zostaną zachowane zgodnie z wymogami prawnymi`,
		html: createEmailWrapper(content)
	};
}

export function createDeletionCancelledEmail(userEmail: string): EmailTemplate {
	const content = `
		${createHeading('Usunięcie konta zostało anulowane', 2)}
		${createParagraph('Witaj,')}
		${createAlert('Usunięcie Twojego konta zostało pomyślnie anulowane.', 'success')}
		${createParagraph('Twoje konto pozostaje aktywne i możesz z niego normalnie korzystać.')}
		${createParagraph('Jeśli masz pytania, skontaktuj się z nami.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: 'Usunięcie konta zostało anulowane',
		text: `Witaj,\n\nUsunięcie Twojego konta zostało pomyślnie anulowane.\n\nTwoje konto pozostaje aktywne i możesz z niego normalnie korzystać.\n\nJeśli masz pytania, skontaktuj się z nami.`,
		html: createEmailWrapper(content)
	};
}

export function createDeletionCompletedEmail(userEmail: string, deletionReason?: string): EmailTemplate {
	// Use different template for inactivity-based deletion
	if (deletionReason === 'inactivity') {
		return createInactivityDeletionCompletedEmail(userEmail);
	}
	
	// Manual deletion template - friendly and personal
	const content = `
		${createHeading('Drogi Użytkowniku / Droga Użytkowniczko,', 2)}
		${createParagraph('Twoje konto zostało pomyślnie usunięte zgodnie z Twoją prośbą.')}
		${createAlert('Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.', 'info')}
		<div style="background-color: ${COLORS.success[50]}; border-left: 4px solid ${COLORS.success[500]}; padding: 20px; margin: 32px 0; border-radius: 6px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.gray[900]}; line-height: 1.6;">
				<strong>Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi.</strong> Było nam niezmiernie miło mieć Cię w naszej społeczności.
			</p>
		</div>
		${createParagraph('Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz.', 'font-size: 16px; font-style: italic; color: ' + COLORS.gray[700] + ';')}
	`;
	
	return {
		subject: 'Twoje konto zostało usunięte',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

Twoje konto zostało pomyślnie usunięte zgodnie z Twoją prośbą.

Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.

Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi. Było nam niezmiernie miło mieć Cię w naszej społeczności.

Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz.

Z wyrazami szacunku,
Zespół PhotoCloud`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityDeletionCompletedEmail(userEmail: string): EmailTemplate {
	const content = `
		${createHeading('Drogi Użytkowniku / Droga Użytkowniczko,', 2)}
		${createParagraph('Z przykrością informujemy, że Twoje konto zostało automatycznie usunięte z powodu długotrwałej nieaktywności (ponad 12 miesięcy).')}
		${createAlert('Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.', 'warning')}
		<div style="background-color: ${COLORS.success[50]}; border-left: 4px solid ${COLORS.success[500]}; padding: 20px; margin: 32px 0; border-radius: 6px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.gray[900]}; line-height: 1.6;">
				<strong>Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi.</strong> Było nam niezmiernie miło mieć Cię w naszej społeczności.
			</p>
		</div>
		${createParagraph('Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz. Jeśli w przyszłości będziesz chciał/chciała ponownie skorzystać z naszych usług, będziemy bardzo szczęśliwi, mogąc Cię powitać z powrotem.', 'font-size: 16px; font-style: italic; color: ' + COLORS.gray[700] + ';')}
	`;
	
	return {
		subject: 'Twoje konto zostało usunięte z powodu nieaktywności',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

Z przykrością informujemy, że Twoje konto zostało automatycznie usunięte z powodu długotrwałej nieaktywności (ponad 12 miesięcy).

Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.

Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi. Było nam niezmiernie miło mieć Cię w naszej społeczności.

Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz. Jeśli w przyszłości będziesz chciał/chciała ponownie skorzystać z naszych usług, będziemy bardzo szczęśliwi, mogąc Cię powitać z powrotem.

Z wyrazami szacunku,
Zespół PhotoCloud`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityReminderEmail(userEmail: string, daysUntilDeletion: number, loginUrl: string, senderEmail: string): EmailTemplate {
	const companyName = 'PhotoCloud';
	const supportEmail = senderEmail;
	const websiteUrl = loginUrl.split('/auth')[0] || 'https://photocloud.com';
	
	const content = `
		${createHeading('Drogi Użytkowniku / Droga Użytkowniczko,', 2)}
		${createParagraph('Zauważyliśmy, że Twoje konto nie było używane od około <strong>11 miesięcy</strong>.')}
		${createParagraph('Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. <strong>Nie chcielibyśmy jednak stracić kontaktu z Tobą!</strong>')}
		${createAlert(`Aby zachować konto i wszystkie Twoje dane, wystarczy, że zalogujesz się w ciągu najbliższych <strong>${daysUntilDeletion} dni</strong>.`, 'info')}
		${createButton('Zaloguj się teraz', loginUrl, 'primary')}
		${createParagraph('Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy przy logowaniu, nasz zespół wsparcia jest do Twojej dyspozycji.', 'margin-top: 24px;')}
		${createParagraph('Dziękujemy, że jesteś z nami i mamy nadzieję wkrótce Cię zobaczyć!')}
		<div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${COLORS.gray[200]};">
			${createSmallText(`Pozdrawiamy serdecznie,<br><strong>Zespół ${companyName}</strong><br><a href="mailto:${supportEmail}" style="color: ${COLORS.primary[500]}; text-decoration: none;">${supportEmail}</a><br><a href="${websiteUrl}" style="color: ${COLORS.primary[500]}; text-decoration: none;">${websiteUrl}</a>`)}
		</div>
	`;
	
	return {
		subject: 'Twoje konto jest nieaktywne',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

Zauważyliśmy, że Twoje konto nie było używane od około 11 miesięcy.

Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. Nie chcielibyśmy jednak stracić kontaktu z Tobą!

Aby zachować konto i wszystkie Twoje dane, wystarczy, że zalogujesz się w ciągu najbliższych ${daysUntilDeletion} dni.
Zaloguj się teraz: ${loginUrl}

Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy przy logowaniu, nasz zespół wsparcia jest do Twojej dyspozycji.

Dziękujemy, że jesteś z nami i mamy nadzieję wkrótce Cię zobaczyć!

Pozdrawiamy serdecznie,
Zespół ${companyName}
${supportEmail}
${websiteUrl}`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityFinalWarningEmail(userEmail: string, deletionDate: string, loginUrl: string, senderEmail: string): EmailTemplate {
	const deletionDateFormatted = new Date(deletionDate).toLocaleDateString('pl-PL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const companyName = 'PhotoCloud';
	const supportEmail = senderEmail;
	const websiteUrl = loginUrl.split('/auth')[0] || 'https://photocloud.com';

	const content = `
		${createHeading('🚨 OSTATNIE OSTRZEŻENIE: Twoje konto zostanie usunięte', 2)}
		${createParagraph('<strong>Drogi Użytkowniku / Droga Użytkowniczko,</strong>')}
		${createParagraph('To jest ostatnie ostrzeżenie przed usunięciem Twojego konta.')}
		${createAlert(`Twoje konto nie było używane od <strong>12 miesięcy</strong> i zostanie automatycznie usunięte:<br><br><strong style="font-size: 18px;">${escapeHtml(deletionDateFormatted)}</strong>`, 'error')}
		${createParagraph('Jeśli chcesz zachować konto i wszystkie Twoje dane, <strong>zaloguj się TERAZ</strong>. Po zalogowaniu usunięcie zostanie automatycznie anulowane.')}
		${createButton('Zaloguj się TERAZ', loginUrl, 'error')}
		${createParagraph(`Jeśli nie zalogujesz się przed tą datą, Twoje konto zostanie trwale usunięte zgodnie z naszą polityką ochrony danych (RODO/GDPR).`, 'color: ' + COLORS.error[500] + '; font-weight: 600;')}
		${createParagraph('Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy, nasz zespół wsparcia jest do Twojej dyspozycji.', 'margin-top: 24px;')}
		<div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${COLORS.gray[200]};">
			${createSmallText(`Pozdrawiamy serdecznie,<br><strong>Zespół ${companyName}</strong><br><a href="mailto:${supportEmail}" style="color: ${COLORS.primary[500]}; text-decoration: none;">${supportEmail}</a><br><a href="${websiteUrl}" style="color: ${COLORS.primary[500]}; text-decoration: none;">${websiteUrl}</a>`)}
		</div>
	`;
	
	return {
		subject: '🚨 OSTATNIE OSTRZEŻENIE: Twoje konto zostanie usunięte',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

To jest ostatnie ostrzeżenie przed usunięciem Twojego konta.

Twoje konto nie było używane od 12 miesięcy i zostanie automatycznie usunięte: ${deletionDateFormatted}

Jeśli chcesz zachować konto i wszystkie Twoje dane, zaloguj się TERAZ. Po zalogowaniu usunięcie zostanie automatycznie anulowane.
Zaloguj się teraz: ${loginUrl}

Jeśli nie zalogujesz się przed tą datą, Twoje konto zostanie trwale usunięte zgodnie z naszą polityką ochrony danych (RODO/GDPR).

Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy, nasz zespół wsparcia jest do Twojej dyspozycji.

Pozdrawiamy serdecznie,
Zespół ${companyName}
${supportEmail}
${websiteUrl}`,
		html: createEmailWrapper(content)
	};
}

