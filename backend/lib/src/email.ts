export interface EmailTemplate {
	subject: string;
	text: string;
	html?: string;
}

// Design system colors matching PixiProof Landing + Dashboard (photographer palette)
const COLORS = {
	brand: {
		accent: '#8B6F57', // photographer-accent
		accentHover: '#7A5F4A', // photographer-accentHover
		accentDark: '#554334', // photographer-accentDark
		accentLight: '#D2B79A', // photographer-accentLight
	},
	surface: {
		background: '#FFFAF5', // photographer-background
		card: '#FFFFFF', // photographer-surface
		elevated: '#F6EFE7', // photographer-elevated
		muted: '#F0E4D7', // photographer-muted
		border: '#E3D3C4', // photographer-border
	},
	text: {
		heading: '#1E1A17', // photographer-heading
		body: '#2D241F', // photographer-text
		muted: '#5A4D42', // photographer-mutedText
	},
	semantic: {
		success: { 500: '#8CA68D', 50: '#E8F0E8' }, // photographer-success (+ light)
		warning: { 500: '#D9A672', 50: '#F5E8D6' }, // photographer-warning (+ light)
		error: { 500: '#C9675A', 50: '#F5E0DD' }, // photographer-error (+ light)
		info: { 500: '#8B6F57', 50: '#FCF8F4' }, // use brand accent (+ light beige)
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

/**
 * Remove any HTML tags from user-provided display strings.
 * This prevents cases where stored values contain markup (e.g. "<strong>...</strong>")
 * and would otherwise show up literally in emails.
 */
function stripHtmlTags(text: string): string {
	return text.replace(/<[^>]*>/g, '');
}

/**
 * Break URL for display so email clients (e.g. Gmail) do not auto-convert it to a clickable anchor.
 * Inserts zero-width spaces at strategic points to break the URL pattern while keeping it readable and copyable.
 * Text stays copyable and readable, but is not turned into a link by the client.
 */
function breakUrlForDisplay(url: string): string {
	// Zero-width space to break URL pattern (invisible but prevents auto-linking)
	const zwsp = '&#8203;';
	const escaped = escapeHtml(url);
	
	// Break URL into parts: protocol, domain, path
	const protocolMatch = escaped.match(/^(https?:\/\/)([^\/]+)(.*)$/);
	if (protocolMatch) {
		const protocol = protocolMatch[1];
		const domain = protocolMatch[2];
		const path = protocolMatch[3];
		// Insert zero-width spaces to break the pattern:
		// - After protocol (between https:// and domain)
		// - Before path (between domain and /)
		// This prevents email clients from recognizing it as a complete URL
		return '<span>' + protocol + '</span>' + zwsp + domain + zwsp + path;
	}
	
	// Fallback: if no protocol, just escape
	return escaped;
}

function sanitizeInlineText(text: string): string {
	return stripHtmlTags(text).replace(/\s+/g, ' ').trim();
}

// Email wrapper with header and footer
function createEmailWrapper(content: string): string {
	return `<!DOCTYPE html>
<html lang="pl">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="color-scheme" content="light">
	<meta name="supported-color-schemes" content="light">
	<title>PixiProof</title>
	<style type="text/css">
		/* Style auto-linked URLs to match theme (beige, no underline) */
		/* Target all auto-linked URLs */
		a[href^="http"] {
			color: ${COLORS.brand.accentDark} !important;
			text-decoration: none !important;
			font-weight: 600 !important;
			border-bottom: none !important;
		}
		/* Specific targeting for URLs in referral link sections */
		p a[href],
		div a[href],
		span a[href] {
			color: ${COLORS.brand.accentDark} !important;
			text-decoration: none !important;
			font-weight: 600 !important;
			border-bottom: none !important;
			-webkit-text-decoration: none !important;
			-moz-text-decoration: none !important;
		}
		/* Override any email client specific link styles */
		a:link,
		a:visited,
		a:hover,
		a:active {
			color: ${COLORS.brand.accentDark} !important;
			text-decoration: none !important;
			font-weight: 600 !important;
		}
	</style>
</head>
<body style="margin: 0; padding: 0; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${COLORS.surface.background};">
	<!-- Preheader (hidden) -->
	<div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
		Powiadomienie od PixiProof.
	</div>
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.surface.background};">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${COLORS.surface.card}; border-radius: 16px; box-shadow: 0px 1px 3px 0px rgba(30, 26, 23, 0.10), 0px 1px 2px 0px rgba(30, 26, 23, 0.06); overflow: hidden;">
					<!-- Content -->
					<tr>
						<td style="padding: 32px 40px;">
							${content}
						</td>
					</tr>
					<!-- Footer -->
					<tr>
						<td style="padding: 22px 40px; border-top: 1px solid ${COLORS.surface.border}; background-color: ${COLORS.surface.background};">
							<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
								Zespół PixiProof<br>
								<small style="color: ${COLORS.text.muted};">Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten e-mail.</small>
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
	const bgColor =
		variant === 'primary'
			? COLORS.brand.accent
			: variant === 'success'
				? COLORS.semantic.success[500]
				: variant === 'error'
					? COLORS.semantic.error[500]
					: COLORS.semantic.warning[500];
	
	return `
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
			<tr>
				<td align="center">
					<a href="${escapeHtml(href)}" role="button" style="display: inline-block; padding: 14px 26px; background-color: ${bgColor}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; line-height: 1.2; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-shadow: 0px 1px 2px rgba(30, 26, 23, 0.10);">${escapeHtml(text)}</a>
				</td>
			</tr>
		</table>
	`;
}

// Alert component
function createAlert(content: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): string {
	const style =
		type === 'success'
			? { bg: COLORS.semantic.success[50], border: COLORS.semantic.success[500] }
			: type === 'error'
				? { bg: COLORS.semantic.error[50], border: COLORS.semantic.error[500] }
				: type === 'warning'
					? { bg: COLORS.semantic.warning[50], border: COLORS.semantic.warning[500] }
					: { bg: COLORS.semantic.info[50], border: COLORS.semantic.info[500] };
	
	return `
		<div style="background-color: ${style.bg}; border: 1px solid ${style.border}; padding: 16px; margin: 24px 0; border-radius: 12px;">
			<div style="color: ${COLORS.text.body}; font-size: 14px; line-height: 1.65; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				${content}
			</div>
		</div>
	`;
}

// Heading component
function createHeading(text: string, level: 1 | 2 = 2): string {
	const size = level === 1 ? '28px' : '22px';
	return `<h${level} style="margin: 0 0 14px 0; font-size: ${size}; font-weight: 800; color: ${COLORS.text.heading}; line-height: 1.25; letter-spacing: -0.02em; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${escapeHtml(text)}</h${level}>`;
}

// Paragraph component (plain text only)
function createParagraph(text: string, style?: string): string {
	const customStyle = style ? ` ${style}` : '';
	return `<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.text.body}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;${customStyle}">${escapeHtml(text)}</p>`;
}

// Paragraph component (allows safe HTML; callers MUST escape dynamic values)
function createParagraphHtml(html: string, style?: string): string {
	const customStyle = style ? ` ${style}` : '';
	return `<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.text.body}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;${customStyle}">${html}</p>`;
}

// Small text component
function createSmallText(text: string): string {
	return `<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${escapeHtml(text)}</p>`;
}

// Small text component (allows safe HTML; callers MUST escape dynamic values)
function createSmallTextHtml(html: string): string {
	return `<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${html}</p>`;
}

export function createSelectionLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Witaj!', 2)}
		${createParagraphHtml(`Zostałeś zaproszony do przeglądania i wyboru zdjęć z galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
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
		${createParagraphHtml(`Klient <strong>${escapeHtml(clientId)}</strong> rozpoczął wybór zdjęć dla galerii <strong>${escapeHtml(galleryId)}</strong>.`)}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; padding: 16px; margin: 24px 0; border-radius: 12px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.text.heading}; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<strong>Wybrano dotychczas:</strong> <span style="font-size: 20px; font-weight: 800; color: ${COLORS.brand.accent};">${selectedCount}</span> zdjęć
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
	galleryName: string | undefined,
	clientId: string,
	selectedCount: number,
	overageCount: number,
	overageCents: number,
	orderId: string,
	orderUrl?: string
): EmailTemplate {
	const overagePLN = (overageCents / 100).toFixed(2);
	const galleryDisplayName = sanitizeInlineText(galleryName || '');
	const galleryPhrase = galleryDisplayName ? `dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong>` : `dla galerii <strong>${escapeHtml(galleryId)}</strong>`;
	const orderButton = orderUrl ? createButton('Otwórz zamówienie', orderUrl, 'primary') : '';
	const orderLinkLine = orderUrl
		? `<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				Link do zamówienia: <a href="${escapeHtml(orderUrl)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(orderUrl)}</a>
			</p>`
		: '';
	const content = `
		${createHeading('Wybór zdjęć został zatwierdzony', 2)}
		${createParagraphHtml(`Klient <strong>${escapeHtml(clientId)}</strong> zakończył wybór zdjęć ${galleryPhrase}. Zamówienie jest gotowe do realizacji.`)}
		<div style="background-color: ${COLORS.semantic.success[50]}; border: 1px solid ${COLORS.semantic.success[500]}; padding: 16px; margin: 24px 0; border-radius: 12px;">
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.text.heading}; font-size: 14px; line-height: 1.9; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<li><strong>Wybrano:</strong> ${selectedCount} zdjęć</li>
				<li><strong>Nadwyżka:</strong> ${overageCount} zdjęć (<strong>${overagePLN} PLN</strong>)</li>
				<li><strong>Numer zamówienia:</strong> ${escapeHtml(orderId)}</li>
			</ul>
		</div>
		${orderButton}
		${orderLinkLine}
		${createParagraph('Możesz teraz przetworzyć zamówienie i przesłać finalne zdjęcia.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: galleryDisplayName
			? `Wybór zdjęć zatwierdzony — ${galleryDisplayName} — Zamówienie ${orderId}`
			: `Wybór zdjęć zatwierdzony — Zamówienie ${orderId}`,
		text:
			`Klient ${clientId} zakończył wybór zdjęć dla galerii ${galleryDisplayName || galleryId}. Zamówienie jest gotowe do realizacji.\n\n` +
			`Wybrano: ${selectedCount} zdjęć\n` +
			`Nadwyżka: ${overageCount} zdjęć (${overagePLN} PLN)\n` +
			`Numer zamówienia: ${orderId}\n` +
			(orderUrl ? `Link do zamówienia: ${orderUrl}\n\n` : '\n') +
			`Możesz teraz przetworzyć zamówienie i przesłać finalne zdjęcia.`,
		html: createEmailWrapper(content)
	};
}

export function createFinalLinkEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Twoje zdjęcia są gotowe!', 2)}
		${createParagraphHtml(`Zdjęcia z galerii <strong>${escapeHtml(galleryDisplayName)}</strong> są już gotowe do pobrania.`)}
		${createButton('Zobacz i pobierz zdjęcia', link, 'primary')}
		${createParagraph('Dziękujemy za wybór naszych usług!', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Twoje zdjęcia są gotowe: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoje zdjęcia z galerii ${galleryDisplayName} są gotowe!\n\nZobacz i pobierz: ${link}\n\nDziękujemy za wybór naszych usług!`,
		html: createEmailWrapper(content)
	};
}

export function createFinalLinkEmailWithPasswordInfo(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Twoje zdjęcia są gotowe!', 2)}
		${createParagraphHtml(`Zdjęcia z galerii <strong>${escapeHtml(galleryDisplayName)}</strong> są już gotowe do pobrania.`)}
		${createButton('Zobacz i pobierz zdjęcia', link, 'primary')}
		${createAlert('<strong>Ważne:</strong> Hasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.', 'info')}
		${createParagraph('Dziękujemy za wybór naszych usług!', 'margin-top: 24px;')}
	`;
	
	return {
		subject: `Twoje zdjęcia są gotowe: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoje zdjęcia z galerii ${galleryDisplayName} są gotowe!\n\nZobacz i pobierz: ${link}\n\nHasło do galerii zostanie wysłane w osobnej wiadomości e-mail ze względów bezpieczeństwa.\n\nDziękujemy za wybór naszych usług!`,
		html: createEmailWrapper(content)
	};
}

/**
 * "Twoje zdjęcia są gotowe" with password in body (same style as zaproszenie do wyboru zdjec).
 * Used for non-selection galleries so client gets one email with link + password.
 */
export function createFinalLinkEmailWithPassword(galleryId: string, galleryName: string, clientEmail: string, link: string, password: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const passwordBlock = `<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0; text-align: center;">
		<p style="margin: 0; font-size: 20px; font-weight: 800; color: ${COLORS.text.heading}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; letter-spacing: 2px;">${escapeHtml(password)}</p>
	</div>`;
	const content = `
		${createHeading('Twoje zdjęcia są gotowe!', 2)}
		${createParagraphHtml(`Zdjęcia z galerii <strong>${escapeHtml(galleryDisplayName)}</strong> są już gotowe do pobrania.`)}
		${createButton('Zobacz i pobierz zdjęcia', link, 'primary')}
		${createParagraphHtml('Hasło do galerii:')}
		${passwordBlock}
		${createSmallText('Prosimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.')}
		${createParagraph('Dziękujemy za wybór naszych usług!', 'margin-top: 24px;')}
	`;

	return {
		subject: `Twoje zdjęcia są gotowe: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoje zdjęcia z galerii ${galleryDisplayName} są gotowe!\n\nZobacz i pobierz: ${link}\n\nHasło do galerii: ${password}\n\nProsimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.\n\nDziękujemy za wybór naszych usług!`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestEmail(galleryId: string, galleryName: string | undefined, clientId: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Prośba o zmianę wyboru', 2)}
		${createParagraphHtml(`Klient <strong>${escapeHtml(clientId)}</strong> złożył prośbę o zmianę wyboru zdjęć dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
		${createAlert('Prosimy przejrzeć i zatwierdzić prośbę o zmianę w panelu.', 'info')}
		${createParagraph('Zaloguj się do panelu, aby zobaczyć szczegóły prośby i podjąć decyzję.')}
	`;
	
	return {
		subject: `Prośba o zmianę wyboru — ${galleryDisplayName}`,
		text: `Klient ${clientId} złożył prośbę o zmianę wyboru zdjęć dla galerii ${galleryDisplayName}.\n\nProsimy przejrzeć i zatwierdzić prośbę o zmianę w panelu.`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestApprovedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || '');
	const galleryPhrase = galleryDisplayName ? `dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong> ` : '';
	const content = `
		${createHeading('Prośba o zmianę została zatwierdzona!', 2)}
		${createParagraphHtml(`Twoja prośba o zmianę wyboru zdjęć ${galleryPhrase}została zatwierdzona!`)}
		${createAlert('Możesz teraz zmodyfikować swój wybór zdjęć.', 'success')}
		${createButton('Otwórz galerię', link, 'success')}
		${createParagraph('Zaloguj się i wprowadź zmiany. Gdy będziesz zadowolony z wyboru, możesz ponownie go zatwierdzić.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: galleryDisplayName ? `Prośba o zmianę zatwierdzona — ${galleryDisplayName}` : 'Prośba o zmianę zatwierdzona',
		text: `Witaj,\n\nTwoja prośba o zmianę wyboru zdjęć dla galerii ${galleryDisplayName} została zatwierdzona!\n\nMożesz teraz zmodyfikować swój wybór.\n\nDostęp do galerii: ${link}\n\nZaloguj się i wprowadź zmiany. Gdy będziesz zadowolony z wyboru, możesz ponownie go zatwierdzić.`,
		html: createEmailWrapper(content)
	};
}

export function createChangeRequestDeniedEmail(galleryId: string, galleryName: string, clientEmail: string, link: string, reason?: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || '');
	const galleryPhrase = galleryDisplayName ? `dla galerii <strong>${escapeHtml(galleryDisplayName)}</strong>` : '';
	const reasonSection = reason 
		? `\n\nPowód: ${reason}`
		: '';
	
	const reasonHtmlSection = reason
		? `<div style="background-color: ${COLORS.semantic.error[50]}; border: 1px solid ${COLORS.semantic.error[500]}; padding: 16px; margin: 24px 0; border-radius: 12px;">
			<p style="margin: 0 0 8px 0; font-weight: 800; color: ${COLORS.text.heading}; font-size: 14px; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Powód:</p>
			<p style="margin: 0; color: ${COLORS.text.body}; font-size: 14px; line-height: 1.7; white-space: pre-wrap; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${escapeHtml(reason).replace(/\n/g, '<br>')}</p>
		</div>`
		: '';
	
	const content = `
		${createHeading('Prośba o zmianę', 2)}
		${createParagraphHtml(`Dziękujemy za prośbę o zmianę wyboru zdjęć ${galleryPhrase ? galleryPhrase + '.' : '.'}`)}
		${createParagraph('Po przejrzeniu Twojej prośby nie możemy w tym momencie wprowadzić zmian. Twój obecny wybór pozostaje zatwierdzony i będziemy przetwarzać zdjęcia zgodnie z wybranymi.')}
		${reasonHtmlSection}
		${createParagraph('Jeśli masz pytania lub wątpliwości, skontaktuj się ze swoim fotografem.', 'margin-top: 24px;')}
		${createButton('Zobacz galerię', link)}
	`;
	
	return {
		subject: galleryDisplayName ? `Prośba o zmianę — ${galleryDisplayName}` : 'Prośba o zmianę',
		text: `Witaj,\n\nDziękujemy za prośbę o zmianę wyboru zdjęć dla galerii ${galleryDisplayName}.\n\nPo przejrzeniu Twojej prośby nie możemy w tym momencie wprowadzić zmian. Twój obecny wybór pozostaje zatwierdzony i będziemy przetwarzać zdjęcia zgodnie z wybranymi.${reasonSection}\n\nJeśli masz pytania lub wątpliwości, skontaktuj się ze swoim fotografem.\n\nZobacz galerię: ${link}`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, daysRemaining: number, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const daysText = daysRemaining === 1 ? 'dzień' : daysRemaining < 5 ? 'dni' : 'dni';
	const content = `
		${createHeading('Galeria wkrótce wygaśnie', 2)}
		${createParagraphHtml(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>${daysRemaining}</strong> ${daysText}.`)}
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
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Zostałeś zaproszony!', 2)}
		${createParagraphHtml(`Zostałeś zaproszony do przeglądania i wyboru zdjęć z galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
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
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Hasło do galerii', 2)}
		${createParagraphHtml(`Hasło do galerii <strong>${escapeHtml(galleryDisplayName)}</strong>:`)}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0; text-align: center;">
			<p style="margin: 0; font-size: 20px; font-weight: 800; color: ${COLORS.text.heading}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; letter-spacing: 2px;">${escapeHtml(password)}</p>
		</div>
		${createButton('Otwórz galerię', link)}
		${createSmallText('Prosimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.')}
	`;
	
	return {
		subject: `Zaproszenie do wyboru zdjęć: ${galleryDisplayName}`,
		text: `Witaj,\n\nHasło do galerii ${galleryDisplayName}:\n\nHasło: ${password}\n\nDostęp do galerii: ${link}\n\nProsimy zachować to hasło w bezpiecznym miejscu. Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryReminderEmail(galleryId: string, galleryName: string, clientEmail: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Przypomnienie o galerii', 2)}
		${createParagraphHtml(`To przypomnienie, że Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> jest nadal dostępna do przeglądania.`)}
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
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Hasło zostało zresetowane', 2)}
		${createParagraphHtml(`Hasło do galerii <strong>${escapeHtml(galleryDisplayName)}</strong> zostało zresetowane przez Twojego fotografa.`)}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 8px 0; font-size: 13px; color: ${COLORS.text.muted}; font-weight: 800; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Nowe hasło:</p>
			<p style="margin: 0; font-size: 20px; font-weight: 800; color: ${COLORS.text.heading}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; letter-spacing: 2px;">${escapeHtml(password)}</p>
		</div>
		${createButton('Otwórz galerię', link)}
		${createSmallText('Jeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.')}
	`;
	
	return {
		subject: `Hasło do galerii PixiProof zostało zresetowane: ${galleryDisplayName}`,
		text: `Witaj,\n\nHasło do galerii ${galleryDisplayName} zostało zresetowane przez Twojego fotografa.\n\nNowe hasło: ${password}\n\nDostęp do galerii: ${link}\n\nJeśli nie spodziewałeś się tej wiadomości, skontaktuj się ze swoim fotografem.`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryWarningEmail(galleryId: string, galleryName: string, daysRemaining: number, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const daysText = daysRemaining === 1 ? 'dzień' : daysRemaining < 5 ? 'dni' : 'dni';
	const content = `
		${createHeading('Galeria wkrótce wygaśnie', 2)}
		${createParagraphHtml(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>${daysRemaining}</strong> ${daysText}.`)}
		${createAlert('<strong>WAŻNE:</strong> Wszystkie zdjęcia zostaną trwale usunięte po wygaśnięciu galerii. To Twoja ostatnia szansa na pobranie potrzebnych zdjęć. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.', 'warning')}
		${createButton('Otwórz galerię teraz', link, 'warning')}
		${createSmallText('Prosimy pobrać wszystkie zdjęcia, które chcesz zachować, przed datą wygaśnięcia.')}
	`;
	
	return {
		subject: `Uwaga: galeria wygaśnie za ${daysRemaining} ${daysText}: ${galleryDisplayName}`,
		text: `Witaj,\n\nTwoja galeria "${galleryDisplayName}" wygaśnie za ${daysRemaining} ${daysText}.\n\nWAŻNE: Wszystkie zdjęcia zostaną trwale usunięte po wygaśnięciu galerii. To Twoja ostatnia szansa na pobranie potrzebnych zdjęć.\n\nOtwórz galerię teraz: ${link}\n\nProsimy pobrać wszystkie zdjęcia, które chcesz zachować, przed datą wygaśnięcia. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.`,
		html: createEmailWrapper(content)
	};
}

export function createExpiryFinalWarningEmail(galleryId: string, galleryName: string, link: string): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const content = `
		${createHeading('Pilne: galeria wygaśnie za 24 godziny', 2)}
		${createParagraphHtml(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> wygaśnie za <strong>24 godziny</strong>.`)}
		${createAlert('<strong>KRYTYCZNE:</strong> Wszystkie zdjęcia zostaną trwale usunięte za 24 godziny. To Twoja ostatnia szansa na pobranie zdjęć. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.', 'error')}
		${createButton('Pobierz zdjęcia teraz', link, 'error')}
		${createSmallText('Prosimy pobrać wszystkie zdjęcia, które chcesz zachować, natychmiast.')}
	`;
	
	return {
		subject: `Pilne: galeria wygaśnie za 24 godziny: ${galleryDisplayName}`,
		text: `Witaj,\n\nPilne: Twoja galeria "${galleryDisplayName}" wygaśnie za 24 godziny.\n\nKRYTYCZNE: Wszystkie zdjęcia zostaną trwale usunięte za 24 godziny. To Twoja ostatnia szansa na pobranie zdjęć.\n\nOtwórz galerię natychmiast: ${link}\n\nProsimy pobrać wszystkie zdjęcia, które chcesz zachować, teraz. Po usunięciu zdjęcia nie będą mogły zostać odzyskane.`,
		html: createEmailWrapper(content)
	};
}

export function createGalleryDeletedEmail(galleryId: string, galleryName: string, deletionSummary?: { s3ObjectsDeleted?: number }): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const summaryText = deletionSummary?.s3ObjectsDeleted 
		? `\n\nPodsumowanie usunięcia:\n- Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}`
		: '';
	const summaryHtml = deletionSummary?.s3ObjectsDeleted
		? `<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 8px 0; font-weight: 800; color: ${COLORS.text.heading}; font-size: 14px; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Podsumowanie usunięcia:</p>
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.text.body}; font-size: 14px; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<li>Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}</li>
			</ul>
		</div>`
		: '';

	const content = `
		${createHeading('Galeria została usunięta', 2)}
		${createParagraphHtml(`Twoja galeria <strong>${escapeHtml(galleryDisplayName)}</strong> została trwale usunięta.`)}
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

/**
 * Owner (photographer) version of gallery deletion email.
 * Same subject and summary; copy is addressed to the photographer, not the client.
 */
export function createGalleryDeletedEmailForOwner(galleryId: string, galleryName: string, deletionSummary?: { s3ObjectsDeleted?: number }): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const summaryText = deletionSummary?.s3ObjectsDeleted
		? `\n\nPodsumowanie usunięcia:\n- Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}`
		: '';
	const summaryHtml = deletionSummary?.s3ObjectsDeleted
		? `<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 8px 0; font-weight: 800; color: ${COLORS.text.heading}; font-size: 14px; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Podsumowanie usunięcia:</p>
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.text.body}; font-size: 14px; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<li>Usunięte obiekty S3: ${deletionSummary.s3ObjectsDeleted}</li>
			</ul>
		</div>`
		: '';

	const content = `
		${createHeading('Galeria została usunięta', 2)}
		${createParagraphHtml(`Galeria <strong>${escapeHtml(galleryDisplayName)}</strong> została trwale usunięta.`)}
		${summaryHtml}
		${createParagraph('Wszystkie zdjęcia, podglądy, miniatury i powiązane dane zostały usunięte z naszego systemu.')}
		${createSmallText('Wysłano potwierdzenie usunięcia do klienta.')}
	`;

	return {
		subject: `Galeria została usunięta: ${galleryDisplayName}`,
		text: `Galeria "${galleryDisplayName}" została trwale usunięta.${summaryText}\n\nWszystkie zdjęcia, podglądy, miniatury i powiązane dane zostały usunięte z naszego systemu.\n\nWysłano potwierdzenie usunięcia do klienta.`,
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
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 16px; margin: 24px 0;">
			<p style="margin: 0 0 12px 0; font-weight: 800; color: ${COLORS.text.heading}; font-size: 14px; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Konsekwencje usunięcia konta:</p>
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.text.body}; font-size: 14px; line-height: 1.9; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
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
		<div style="background-color: ${COLORS.semantic.success[50]}; border: 1px solid ${COLORS.semantic.success[500]}; padding: 20px; margin: 32px 0; border-radius: 12px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.text.heading}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<strong>Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi.</strong> Było nam niezmiernie miło mieć Cię w naszej społeczności.
			</p>
		</div>
		${createParagraph('Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz.', 'font-size: 16px; font-style: italic; color: ' + COLORS.text.body + ';')}
	`;
	
	return {
		subject: 'Twoje konto zostało usunięte',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

Twoje konto zostało pomyślnie usunięte zgodnie z Twoją prośbą.

Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.

Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi. Było nam niezmiernie miło mieć Cię w naszej społeczności.

Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz.

Z wyrazami szacunku,
Zespół PixiProof`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityDeletionCompletedEmail(userEmail: string): EmailTemplate {
	const content = `
		${createHeading('Drogi Użytkowniku / Droga Użytkowniczko,', 2)}
		${createParagraph('Z przykrością informujemy, że Twoje konto zostało automatycznie usunięte z powodu długotrwałej nieaktywności (ponad 12 miesięcy).')}
		${createAlert('Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.', 'warning')}
		<div style="background-color: ${COLORS.semantic.success[50]}; border: 1px solid ${COLORS.semantic.success[500]}; padding: 20px; margin: 32px 0; border-radius: 12px;">
			<p style="margin: 0; font-size: 16px; color: ${COLORS.text.heading}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<strong>Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi.</strong> Było nam niezmiernie miło mieć Cię w naszej społeczności.
			</p>
		</div>
		${createParagraph('Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz. Jeśli w przyszłości będziesz chciał/chciała ponownie skorzystać z naszych usług, będziemy bardzo szczęśliwi, mogąc Cię powitać z powrotem.', 'font-size: 16px; font-style: italic; color: ' + COLORS.text.body + ';')}
	`;
	
	return {
		subject: 'Twoje konto zostało usunięte z powodu nieaktywności',
		text: `Drogi Użytkowniku / Droga Użytkowniczko,

Z przykrością informujemy, że Twoje konto zostało automatycznie usunięte z powodu długotrwałej nieaktywności (ponad 12 miesięcy).

Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. Wszystkie dane osobowe zostały usunięte z naszego systemu. Dane finansowe zostały zachowane zgodnie z wymogami prawnymi.

Chcielibyśmy serdecznie podziękować Ci za współpracę i za to, że wybrałeś/wybrałaś nasze usługi. Było nam niezmiernie miło mieć Cię w naszej społeczności.

Będzie nam Cię brakować i mamy nadzieję, że kiedyś znów do nas wrócisz. Jeśli w przyszłości będziesz chciał/chciała ponownie skorzystać z naszych usług, będziemy bardzo szczęśliwi, mogąc Cię powitać z powrotem.

Z wyrazami szacunku,
Zespół PixiProof`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityReminderEmail(
	userEmail: string,
	daysUntilDeletion: number,
	loginUrl: string,
	senderEmail: string,
	websiteUrl: string
): EmailTemplate {
	const companyName = 'PixiProof';
	const supportEmail = senderEmail;
	const websiteUrlNormalized = websiteUrl.replace(/\/+$/, '');
	
	const content = `
		${createHeading('Drogi Użytkowniku / Droga Użytkowniczko,', 2)}
		${createParagraphHtml('Zauważyliśmy, że Twoje konto nie było używane od około <strong>11 miesięcy</strong>.')}
		${createParagraphHtml('Zgodnie z naszą polityką ochrony danych (RODO/GDPR) konta, które pozostają nieaktywne przez dłuższy czas, są automatycznie usuwane. <strong>Nie chcielibyśmy jednak stracić kontaktu z Tobą!</strong>')}
		${createAlert(`Aby zachować konto i wszystkie Twoje dane, wystarczy, że zalogujesz się w ciągu najbliższych <strong>${daysUntilDeletion} dni</strong>.`, 'info')}
		${createButton('Zaloguj się teraz', loginUrl, 'primary')}
		${createParagraph('Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy przy logowaniu, nasz zespół wsparcia jest do Twojej dyspozycji.', 'margin-top: 24px;')}
		${createParagraph('Dziękujemy, że jesteś z nami i mamy nadzieję wkrótce Cię zobaczyć!')}
		<div style="margin-top: 28px; padding-top: 22px; border-top: 1px solid ${COLORS.surface.border};">
			${createSmallTextHtml(`Pozdrawiamy serdecznie,<br><strong>Zespół ${escapeHtml(companyName)}</strong><br><a href="mailto:${escapeHtml(supportEmail)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(supportEmail)}</a><br><a href="${escapeHtml(websiteUrlNormalized)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(websiteUrlNormalized)}</a>`)}
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
${websiteUrlNormalized}`,
		html: createEmailWrapper(content)
	};
}

export function createInactivityFinalWarningEmail(
	userEmail: string,
	deletionDate: string,
	loginUrl: string,
	senderEmail: string,
	websiteUrl: string
): EmailTemplate {
	const deletionDateFormatted = new Date(deletionDate).toLocaleDateString('pl-PL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const companyName = 'PixiProof';
	const supportEmail = senderEmail;
	const websiteUrlNormalized = websiteUrl.replace(/\/+$/, '');

	const content = `
		${createHeading('Ostatnie ostrzeżenie: Twoje konto zostanie usunięte', 2)}
		${createParagraphHtml('<strong>Drogi Użytkowniku / Droga Użytkowniczko,</strong>')}
		${createParagraph('To jest ostatnie ostrzeżenie przed usunięciem Twojego konta.')}
		${createAlert(`Twoje konto nie było używane od <strong>12 miesięcy</strong> i zostanie automatycznie usunięte:<br><br><strong style="font-size: 18px;">${escapeHtml(deletionDateFormatted)}</strong>`, 'error')}
		${createParagraphHtml('Jeśli chcesz zachować konto i wszystkie Twoje dane, <strong>zaloguj się TERAZ</strong>. Po zalogowaniu usunięcie zostanie automatycznie anulowane.')}
		${createButton('Zaloguj się TERAZ', loginUrl, 'error')}
		${createParagraph(`Jeśli nie zalogujesz się przed tą datą, Twoje konto zostanie trwale usunięte zgodnie z naszą polityką ochrony danych (RODO/GDPR).`, 'color: ' + COLORS.semantic.error[500] + '; font-weight: 800;')}
		${createParagraph('Jeśli masz jakiekolwiek pytania lub potrzebujesz pomocy, nasz zespół wsparcia jest do Twojej dyspozycji.', 'margin-top: 24px;')}
		<div style="margin-top: 28px; padding-top: 22px; border-top: 1px solid ${COLORS.surface.border};">
			${createSmallTextHtml(`Pozdrawiamy serdecznie,<br><strong>Zespół ${escapeHtml(companyName)}</strong><br><a href="mailto:${escapeHtml(supportEmail)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(supportEmail)}</a><br><a href="${escapeHtml(websiteUrlNormalized)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(websiteUrlNormalized)}</a>`)}
		</div>
	`;
	
	return {
		subject: 'Ostatnie ostrzeżenie: Twoje konto zostanie usunięte',
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
${websiteUrlNormalized}`,
		html: createEmailWrapper(content)
	};
}

export function createExportEmail(galleryDisplayName: string, photoCount: number, manifestJson: string): EmailTemplate {
	const safeGalleryDisplayName = sanitizeInlineText(galleryDisplayName);
	const content = `
		${createHeading('Eksport zdjęć jest gotowy', 2)}
		${createParagraphHtml(`Galeria: <strong>${escapeHtml(safeGalleryDisplayName)}</strong><br>Liczba zdjęć: <strong>${photoCount}</strong>`)}
		${createParagraph('Poniżej znajduje się manifest w formacie JSON (linki wygasają po 24 godzinach).')}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 14px; margin: 20px 0;">
			<pre style="margin: 0; font-size: 12px; line-height: 1.6; color: ${COLORS.text.body}; white-space: pre; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${escapeHtml(manifestJson)}</pre>
		</div>
		${createSmallText('Jeśli masz pytania, skontaktuj się ze swoim fotografem.')}
	`;

	return {
		subject: `Eksport zdjęć: ${safeGalleryDisplayName}`,
		text:
			`Eksport zdjęć jest gotowy.\n\n` +
			`Galeria: ${safeGalleryDisplayName}\n` +
			`Liczba zdjęć: ${photoCount}\n\n` +
			`Manifest (JSON):\n${manifestJson}\n\n` +
			`Wszystkie linki wygasają po 24 godzinach.`,
		html: createEmailWrapper(content),
	};
}

/**
 * Creates a verification code email template matching PixiProof design system
 * This is used for Cognito email verification codes
 * Note: The {####} placeholder will be replaced by Cognito with the actual code
 */
export function createVerificationCodeEmail(codePlaceholder: string = '{####}'): string {
	const content = `
		${createHeading('Weryfikuj swoje konto', 2)}
		${createParagraph('Dziękujemy za rejestrację! Aby dokończyć tworzenie konta, wprowadź poniższy kod weryfikacyjny:')}
		<div style="background-color: ${COLORS.surface.elevated}; border: 2px dashed ${COLORS.brand.accent}; border-radius: 12px; padding: 24px; margin: 32px 0; text-align: center;">
			<p style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${COLORS.brand.accent}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${codePlaceholder}</p>
		</div>
		${createSmallText('Ten kod jest ważny przez 15 minut. Jeśli nie rejestrowałeś się w PixiProof, możesz zignorować tę wiadomość.')}
	`;
	
	return createEmailWrapper(content);
}

export function createWelcomeEmail(params: {
	dashboardUrl: string;
	landingUrl: string;
	privacyUrl: string;
	termsUrl: string;
	companyName?: string;
	isReferred?: boolean;
}): EmailTemplate {
	const dashboardUrl = params.dashboardUrl.replace(/\/+$/, '');
	const landingUrl = params.landingUrl.replace(/\/+$/, '');
	const privacyUrl = params.privacyUrl || `${landingUrl}/privacy`;
	const termsUrl = params.termsUrl || `${landingUrl}/terms`;
	const companyName = params.companyName?.trim() || 'PixiProof';
	const isReferred = params.isReferred === true;

	const referralDiscountInfo = isReferred
		? `
		<div style="background-color: ${COLORS.semantic.info[50]}; border: 1px solid ${COLORS.brand.accent}; border-radius: 12px; padding: 16px; margin: 20px 0;">
			<p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: ${COLORS.text.heading}; font-family: Outfit, Inter, sans-serif;">🎁 Zniżka za link polecający</p>
			<p style="margin: 0; font-size: 14px; color: ${COLORS.text.body}; line-height: 1.6; font-family: Outfit, Inter, sans-serif;">
				Twoje konto jest powiązane z zaproszeniem. Zniżka za link polecający naliczy się automatycznie przy pierwszej płatnej galerii (gdy doładujesz portfel lub wykorzystasz już prezent powitalny). Kod rabatowy nie jest wymagany — powiązanie wynika z rejestracji przez link.
			</p>
		</div>
	`
		: '';

	const content = `
		${createHeading("Witaj w PixiProof!", 2)}
		${createParagraph("Twoje konto zostało pomyślnie utworzone. Cieszymy się, że jesteś z nami!")}
		${createParagraph("W podziękowaniu zostawiliśmy w Twoim portfelu mały prezent powitalny — wystarczy na pierwszą galerię. To nasz sposób, by powiedzieć: Dziękujemy za Twój czas!")}
		${referralDiscountInfo}

		${createHeading("Pierwsze kroki", 2)}
		${createParagraphHtml(`
			<ol style="margin: 0 0 16px 0; padding-left: 20px; color: ${COLORS.text.body}; font-size: 16px; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<li>Zaloguj się do panelu i dokończ konfigurację konta.</li>
				<li>Utwórz pierwszą galerię (na start masz 1 darmową galerię testową).</li>
				<li>Wyślij klientowi link i zbieraj wybór zdjęć bez chaosu w wiadomościach.</li>
			</ol>
		`)}
		${createButton("Przejdź do panelu", `${dashboardUrl}/login`, "primary")}

		${createHeading("Dokumenty i ochrona danych", 2)}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 20px; margin: 20px 0;">
			<p style="margin: 0 0 12px 0; font-size: 15px; color: ${COLORS.text.body}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				Administratorem danych jest <strong>PixiProof</strong>. Szczegóły znajdziesz w dokumentach poniżej.
			</p>
			<p style="margin: 0; font-size: 14px; line-height: 1.8; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<a href="${escapeHtml(termsUrl)}" style="color: ${COLORS.brand.accent}; text-decoration: none; font-weight: 600;">Regulamin</a><br>
				<a href="${escapeHtml(privacyUrl)}" style="color: ${COLORS.brand.accent}; text-decoration: none; font-weight: 600;">Polityka Prywatności / RODO</a>
			</p>
		</div>
	`;

	const textReferralInfo = isReferred
		? `\n🎁 Zniżka za link polecający: Twoje konto jest powiązane z zaproszeniem. Zniżka naliczy się automatycznie przy pierwszej płatnej galerii (gdy doładujesz portfel lub wykorzystasz już prezent powitalny). Kod rabatowy nie jest wymagany.\n\n`
		: '';

	return {
		subject: 'Witamy w PixiProof — pierwsze kroki',
		text:
			`Witaj w PixiProof!\n\n` +
			`Twoje konto zostało pomyślnie utworzone.\n\n` +
			`W podziękowaniu zostawiliśmy w Twoim portfelu mały prezent powitalny — wystarczy na pierwszą galerię. To nasz sposób, by powiedzieć: Dziękujemy za Twój czas!\n` +
			textReferralInfo +
			`Pierwsze kroki:\n` +
			`1) Zaloguj się do panelu\n` +
			`2) Utwórz pierwszą galerię\n` +
			`3) Wyślij klientowi link\n\n` +
			`Panel: ${dashboardUrl}/login\n\n` +
			`Administratorem danych jest PixiProof.\n` +
			`Regulamin: ${termsUrl}\n` +
			`Polityka Prywatności/RODO: ${privacyUrl}\n`,
		html: createEmailWrapper(content),
	};
}

/** Second email: referral program info (no code – user not eligible yet). Polish. */
export function createReferralProgramInfoEmail(params: { dashboardUrl: string; isReferred?: boolean }): EmailTemplate {
	const dashboardUrl = params.dashboardUrl.replace(/\/+$/, '');
	const isReferred = params.isReferred === true;

	const referredUserInfo = isReferred
		? `
		<div style="background-color: ${COLORS.semantic.info[50]}; border: 1px solid ${COLORS.brand.accent}; border-radius: 12px; padding: 16px; margin: 20px 0;">
			<p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: ${COLORS.text.heading}; font-family: Outfit, Inter, sans-serif;">🎁 Zniżka za link polecający</p>
			<p style="margin: 0; font-size: 14px; color: ${COLORS.text.body}; line-height: 1.6; font-family: Outfit, Inter, sans-serif;">
				Twoje konto jest powiązane z zaproszeniem. Zniżka za link polecający naliczy się automatycznie przy pierwszej płatnej galerii (gdy doładujesz portfel lub wykorzystasz już prezent powitalny). Kod rabatowy nie jest wymagany — powiązanie wynika z rejestracji przez link.
			</p>
		</div>
	`
		: '';

	const content = `
		${createHeading("Zaproszenia i nagrody", 2)}
		${referredUserInfo}
		${createParagraph("W programie „Zaproszenia i nagrody” zapraszasz znajomych do PixiProof. Gdy zaproszona osoba opłaci pierwszą galerię lub doładuje portfel, otrzymasz kod rabatowy. Swój unikalny link i kod znajdziesz w panelu po opłaceniu przez Ciebie pierwszej galerii lub doładowaniu portfela używając STRIPE.")}
		${createHeading("Tabela nagród", 2)}
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse; margin: 16px 0; font-size: 15px; color: ${COLORS.text.body}; font-family: Outfit, Inter, sans-serif;">
			<thead>
				<tr style="border-bottom: 2px solid ${COLORS.surface.border};">
					<th style="text-align: left; padding: 10px 12px 8px 0;">Liczba opłaconych zaproszeń*</th>
					<th style="text-align: left; padding: 10px 12px 8px 0;">Nagroda dla Ciebie</th>
					<th style="text-align: left; padding: 10px 12px 8px 0;">Nagrody dla osoby poleconej</th>
				</tr>
			</thead>
			<tbody>
				<tr style="border-bottom: 1px solid ${COLORS.surface.border};">
					<td style="padding: 10px 12px 10px 0;">1</td>
					<td style="padding: 10px 12px 10px 0;">Kod rabatowy 10%</td>
					<td style="padding: 10px 12px 10px 0;">10% zniżki na pierwszą galerię</td>
				</tr>
				<tr style="border-bottom: 1px solid ${COLORS.surface.border};">
					<td style="padding: 10px 12px 10px 0;">3</td>
					<td style="padding: 10px 12px 10px 0;">Darmowa galeria 1 GB</td>
					<td style="padding: 10px 12px 10px 0;">10% zniżki na pierwszą galerię</td>
				</tr>
				<tr>
					<td style="padding: 10px 12px 10px 0;">10 lub więcej</td>
					<td style="padding: 10px 12px 10px 0;">Doładowanie portfela za 20 PLN** + odznaka Top Inviter</td>
					<td style="padding: 10px 12px 10px 0;">15% zniżki na pierwszą galerię</td>
				</tr>
			</tbody>
		</table>
		<p style="margin: 0 0 16px 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6;">* Liczba osób powiązanych z Twoim linkiem, które opłaciły pierwszą galerię lub doładowały portfel (płatność realna STRIPE).<br/>** 20 PLN – jednorazowy bonus; środki bezzwrotne do wykorzystania wyłącznie w naszym systemie.</p>
		${createParagraph("Swój link i kod zobaczysz w panelu po opłaceniu pierwszej galerii lub doładowaniu portfela.")}
		<div style="margin: 20px 0 0 0; padding: 12px 16px; background-color: ${COLORS.surface.elevated}; border-radius: 8px; font-size: 12px; color: ${COLORS.text.muted}; line-height: 1.6;">
			<strong style="color: ${COLORS.text.body};">Ograniczenia:</strong>
			<ul style="margin: 8px 0 0 0; padding-left: 20px;">
				<li style="margin-bottom: 4px;">Kody są ważne na plany 1 GB i 3 GB (1 lub 3 miesiące), nie na plany 12-miesięczne ani 10 GB.</li>
				<li style="margin-bottom: 4px;">Kody są ważne przez 6 miesięcy.</li>
				<li style="margin-bottom: 4px;">Kody są jednorazowe.</li>
				<li style="margin-bottom: 4px;">Nie można łączyć z innymi promocjami.</li>
			</ul>
		</div>
		${createButton("Przejdź do panelu", dashboardUrl, "primary")}
	`;
	const textReferredInfo = isReferred
		? '\nZniżka za link polecający: Twoje konto jest powiązane z zaproszeniem. Zniżka naliczy się automatycznie przy pierwszej płatnej galerii (gdy doładujesz portfel lub wykorzystasz już prezent powitalny). Kod rabatowy nie jest wymagany.\n\n'
		: '';

	return {
    subject: "Zaproszenia i nagrody — zdobądź kody rabatowe",
    text:
      "Zaproszenia i nagrody\n\n" +
      textReferredInfo +
      "W programie zapraszasz znajomych; gdy opłacą pierwszą galerię lub doładują portfel, Ty dostajesz kod rabatowy. Swój link otrzymasz w panelu po opłaceniu pierwszej galerii lub doładowaniu portfela.\n\n" +
      "Tabela nagród (* = liczba osób powiązanych z linkiem, które opłaciły pierwszą galerię lub doładowały portfel):\n" +
      "1 – Kod rabatowy 10% (osoba polecona: 10% zniżki)\n3 – Darmowa galeria 1 GB (osoba polecona: 10% zniżki)\n10+ – Doładowanie portfela za 20 PLN** + odznaka Top Inviter (osoba polecona: 15% zniżki)\n** 20 PLN – jednorazowy bonus; środki bezzwrotne do wykorzystania wyłącznie w naszym systemie.\n\n" +
      "Ograniczenia:\n• Kody są ważne na plany 1 GB i 3 GB (1 lub 3 miesiące), nie na plany 12-miesięczne ani 10 GB\n• Kody są ważne przez 6 miesięcy\n• Kody są jednorazowe\n• Nie można łączyć z innymi promocjami\n\n" +
      `Panel: ${dashboardUrl}\n`,
    html: createEmailWrapper(content),
  };
}

/** Eligibility email: user just became eligible – send their referral code and link. Polish. */
export function createEligibilityEmail(params: {
	referralCode: string;
	referralLink: string;
	dashboardUrl: string;
}): EmailTemplate {
	const { referralCode, referralLink, dashboardUrl } = params;
	const linkBoxBg = COLORS.semantic.info[50];
	const linkBoxBorder = COLORS.brand.accent;
	const linkColor = COLORS.brand.accentDark;
	const content = `
		${createHeading('Twój link zaproszenia jest gotowy', 2)}
		${createParagraph('Gratulacje! – możesz teraz zapraszać znajomych i zdobywać kody rabatowe.')}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 20px; margin: 20px 0;">
			<p style="margin: 0 0 8px 0; font-size: 14px; color: ${COLORS.text.muted}; font-family: Outfit, Inter, sans-serif;">Twój kod:</p>
			<p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: ${COLORS.text.heading}; font-family: monospace;">${escapeHtml(referralCode)}</p>
			<p style="margin: 0 0 8px 0; font-size: 14px; color: ${COLORS.text.muted}; font-family: Outfit, Inter, sans-serif;">Twój link zaproszenia:</p>
			<div style="background-color: ${linkBoxBg}; border: 2px solid ${linkBoxBorder}; border-radius: 12px; padding: 16px 20px; margin: 8px 0 0 0;">
				<p style="display: block; margin: 0; font-size: 18px; font-weight: 600; color: ${linkColor}; text-decoration: none; word-break: break-all; font-family: Outfit, Inter, sans-serif; user-select: all; -webkit-user-select: all; cursor: text;">
					<span style="color: ${linkColor}; font-weight: 600; text-decoration: none;">${escapeHtml(referralLink)}</span>
				</p>
			</div>
		</div>
		${createParagraph('Udostępnij link znajomym. Gdy opłacą pierwszą galerię lub doładują portfel, otrzymasz kod rabatowy.')}
		${createButton('Otwórz panel', dashboardUrl.replace(/\/+$/, ''), 'primary')}
	`;
	return {
		subject: 'Twój link zaproszenia — PixiProof',
		text: `Twój link zaproszenia jest gotowy.\n\nKod: ${referralCode}\nLink: ${referralLink}\n\nPanel: ${dashboardUrl}\n`,
		html: createEmailWrapper(content),
	};
}

/** Referrer reward email: e.g. "Otrzymałeś kod rabatowy 10%". Polish. */
export function createReferrerRewardEmail(params: {
	rewardType: '10_percent' | 'free_small' | '15_percent' | 'wallet_20pln';
	dashboardUrl: string;
}): EmailTemplate {
	const dashboardUrl = params.dashboardUrl.replace(/\/+$/, '');
	const isWallet = params.rewardType === 'wallet_20pln';
	const label =
		params.rewardType === '10_percent'
			? '10%'
			: params.rewardType === '15_percent'
				? '15%'
				: params.rewardType === 'wallet_20pln'
					? 'Doładowanie portfela za 20 PLN'
					: 'darmowa galeria 1 GB';
	const content = isWallet
    ? `
		${createHeading("Świetna robota!", 2)}
		${createParagraph("Ktoś powiązany z Twoim linkiem opłacił galerię lub doładował portfel. Otrzymałeś doładowanie portfela za 20 PLN* (nagroda za 10. zaproszenie).")}
		<p style="margin: 0 0 16px 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6;">* 20 PLN – jednorazowy bonus; środki bezzwrotne do wykorzystania wyłącznie w naszym systemie.</p>
		${createParagraph("Sprawdź saldo w panelu w sekcji „Portfel”.")}
		${createButton("Otwórz panel", dashboardUrl, "primary")}
	`
    : params.rewardType === "free_small"
      ? `
		${createHeading("Świetna robota!", 2)}
		${createParagraph("Ktoś powiązany z Twoim linkiem opłacił galerię lub doładował portfel. Otrzymałeś nagrodę: darmowa galeria 1 GB.")}
		${createParagraph("Sprawdź go w panelu w sekcji „Zaproszenia i nagrody”.")}
		${createButton("Otwórz panel", dashboardUrl, "primary")}
	`
      : `
		${createHeading("Świetna robota!", 2)}
		${createParagraph(`Ktoś powiązany z Twoim linkiem opłacił galerię lub doładował portfel. Otrzymałeś kod rabatowy ${label}.`)}
		${createParagraph("Sprawdź go w panelu w sekcji „Zaproszenia i nagrody”.")}
		${createButton("Otwórz panel", dashboardUrl, "primary")}
	`;
	const subject = isWallet
		? 'Otrzymałeś doładowanie portfela za 20 PLN — PixiProof'
		: params.rewardType === 'free_small'
			? 'Otrzymałeś nagrodę: darmowa galeria 1 GB — PixiProof'
			: `Otrzymałeś kod rabatowy ${label} — PixiProof`;
	const textBody = isWallet
    ? `Świetna robota! Otrzymałeś doładowanie portfela za 20 PLN* (nagroda za 10. zaproszenie). * 20 PLN – jednorazowy bonus; środki bezzwrotne do wykorzystania wyłącznie w naszym systemie. Sprawdź saldo w panelu.\n\n${dashboardUrl}\n`
    : params.rewardType === "free_small"
      ? `Świetna robota! Otrzymałeś nagrodę: darmowa galeria 1 GB. Sprawdź go w panelu w sekcji „Zaproszenia i nagrody”.\n\n${dashboardUrl}\n`
      : `Świetna robota! Otrzymałeś kod rabatowy ${label}. Sprawdź go w panelu w sekcji „Zaproszenia i nagrody”.\n\n${dashboardUrl}\n`;
	return {
		subject,
		text: textBody,
		html: createEmailWrapper(content),
	};
}

export function createZipGenerationFailedEmail(
	galleryId: string,
	galleryName: string,
	orderId: string,
	attempts: number,
	dashboardUrl?: string
): EmailTemplate {
	const galleryDisplayName = sanitizeInlineText(galleryName || galleryId);
	const attemptsText = attempts === 1 ? '1 próbę' : attempts < 5 ? `${attempts} próby` : `${attempts} prób`;
	
	const dashboardLink = dashboardUrl 
		? createButton('Otwórz zamówienie w panelu', dashboardUrl, 'primary')
		: '';
	const dashboardLinkText = dashboardUrl
		? `<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				Link do zamówienia: <a href="${escapeHtml(dashboardUrl)}" style="color: ${COLORS.brand.accent}; text-decoration: none;">${escapeHtml(dashboardUrl)}</a>
			</p>`
		: '';
	
	const content = `
		${createHeading('Błąd generowania pliku ZIP', 2)}
		${createParagraphHtml(`Wystąpił problem podczas automatycznego generowania pliku ZIP dla zamówienia <strong>${escapeHtml(orderId)}</strong> w galerii <strong>${escapeHtml(galleryDisplayName)}</strong>.`)}
		${createAlert(`System wykonał ${attemptsText} automatycznego generowania pliku ZIP, ale wszystkie próby zakończyły się niepowodzeniem.`, 'error')}
		<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; padding: 16px; margin: 24px 0; border-radius: 12px;">
			<ul style="margin: 0; padding-left: 20px; color: ${COLORS.text.heading}; font-size: 14px; line-height: 1.9; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
				<li><strong>Galeria:</strong> ${escapeHtml(galleryDisplayName)}</li>
				<li><strong>Numer zamówienia:</strong> ${escapeHtml(orderId)}</li>
				<li><strong>Liczba prób:</strong> ${attempts}</li>
			</ul>
		</div>
		${createParagraph('Możesz spróbować wygenerować plik ZIP ręcznie w panelu zarządzania zamówieniem. Jeśli problem będzie się powtarzał, skontaktuj się z nami.')}
		${dashboardLink}
		${dashboardLinkText}
		${createParagraph('Szczegóły błędu zostały zapisane w systemie i będą dostępne w panelu zarządzania zamówieniem.', 'margin-top: 24px;')}
	`;
	
	return {
		subject: galleryDisplayName
			? `Błąd generowania ZIP — ${galleryDisplayName} — Zamówienie ${orderId}`
			: `Błąd generowania ZIP — Zamówienie ${orderId}`,
		text:
			`Wystąpił problem podczas automatycznego generowania pliku ZIP dla zamówienia ${orderId} w galerii ${galleryDisplayName}.\n\n` +
			`System wykonał ${attemptsText} automatycznego generowania pliku ZIP, ale wszystkie próby zakończyły się niepowodzeniem.\n\n` +
			`Galeria: ${galleryDisplayName}\n` +
			`Numer zamówienia: ${orderId}\n` +
			`Liczba prób: ${attempts}\n\n` +
			`Możesz spróbować wygenerować plik ZIP ręcznie w panelu zarządzania zamówieniem. Jeśli problem będzie się powtarzał, skontaktuj się z nami.\n` +
			(dashboardUrl ? `\nLink do zamówienia: ${dashboardUrl}\n` : '') +
			`\nSzczegóły błędu zostały zapisane w systemie i będą dostępne w panelu zarządzania zamówieniem.`,
		html: createEmailWrapper(content)
	};
}

