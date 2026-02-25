const DEFAULT_IMAGE_WIDTH = 400;

const parseImgWidth = (imgOpenTag) => {
	const m = String(imgOpenTag).match(/width\s*=\s*(\d+)/i);
	return m ? Number(m[1]) : null;
};

const stripDataUriPrefix = (s) =>
	String(s).trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

const stripNewlines = (s) => String(s).replace(/(\r\n|\n|\r)/g, '');

const isTagToken = (token) => typeof token === 'string' && token.startsWith('<') && token.endsWith('>');

const tokenizeTags = (text) => String(text).split(/(<[^>]+>)/g).filter((t) => t !== '');

export const createHtmlPrinterMapper = (COMMANDS) => {
	if (!COMMANDS?.TEXT_FORMAT) return {};
	return {
		'<l>': COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT,
		'<c>': COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT,
		'<r>': COMMANDS.TEXT_FORMAT.TXT_ALIGN_RT,

		'<b>': COMMANDS.TEXT_FORMAT.TXT_BOLD_ON,
		'</b>': COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF,

		'<u>': COMMANDS.TEXT_FORMAT.TXT_UNDERL_ON,
		'</u>': COMMANDS.TEXT_FORMAT.TXT_UNDERL_OFF,

		'<font-a>': COMMANDS.TEXT_FORMAT.TXT_FONT_A,
		'<font-b>': COMMANDS.TEXT_FORMAT.TXT_FONT_B,

		'<h2x>': COMMANDS.TEXT_FORMAT.TXT_2HEIGHT,
		'<w2x>': COMMANDS.TEXT_FORMAT.TXT_2WIDTH,
		'<big>': COMMANDS.TEXT_FORMAT.TXT_4SQUARE,

		'<norm>': COMMANDS.TEXT_FORMAT.TXT_NORMAL,
	};
};

export const mapReceiptTagsToCommands = (textWithTags, mapper) => {
	if (!textWithTags) return '';
	if (!mapper) return String(textWithTags);

	const tokens = tokenizeTags(textWithTags);
	let out = '';
	for (const tok of tokens) {
		if (isTagToken(tok)) {
			const key = tok.toLowerCase();
			out += mapper[key] ?? '';
			continue;
		}
		out += tok;
	}
	return out;
};

/**
 * Converts wrapped receipt template into sequential print jobs.
 * - Text jobs: contain ESC/POS commands (via COMMANDS mapping)
 * - Image jobs: { base64, imageWidth }
 *
 * IMPORTANT: This expects the input to already be wrapped via `wordWrapByDots`,
 * because we want printing line breaks to match the preview exactly.
 */
export const buildThermalPrintJobsFromWrappedTemplate = ({
	wrappedTemplate,
	COMMANDS,
	placeholderBase64Map,
	defaultImageWidth = DEFAULT_IMAGE_WIDTH,
}) => {
	const tpl = String(wrappedTemplate ?? '');
	const jobs = [];
	if (!tpl) return jobs;

	const mapper = createHtmlPrinterMapper(COMMANDS);
	const IMG_RE = /(<img\b[^>]*>)([\s\S]*?)(<\/img>)/gi;

	// Maps tags to ESC/POS commands while tracking alignment inline.
	// Injects the *currently active* alignment command after every \n so that
	// soft-wrapped lines stay aligned even when the printer resets on line feed.
	// Returns { value: mappedString, finalAlign: 'left'|'center'|'right' }.
	const mapWithAlignTracking = (textWithTags, startAlign) => {
		if (!textWithTags) return { value: '', finalAlign: startAlign };
		const tokens = tokenizeTags(textWithTags);
		let out = '';
		let align = startAlign;
		const alignCmd = () =>
			align === 'center' ? (mapper['<c>'] ?? '') :
			align === 'right'  ? (mapper['<r>'] ?? '') :
			(mapper['<l>'] ?? '');
		for (const tok of tokens) {
			if (isTagToken(tok)) {
				const key = tok.toLowerCase();
				if (key === '<l>') align = 'left';
				else if (key === '<c>') align = 'center';
				else if (key === '<r>') align = 'right';
				out += mapper[key] ?? '';
			} else if (tok.includes('\n')) {
				// Re-emit alignment after each newline so wrapped lines stay aligned.
				out += tok.split('\n').join('\n' + alignCmd());
			} else {
				out += tok;
			}
		}
		return { value: out, finalAlign: align };
	};

	let currentAlign = 'left';

	let lastIndex = 0;
	for (const match of tpl.matchAll(IMG_RE)) {
		const full = match[0];
		const openTag = match[1];
		const content = match[2];
		const start = match.index ?? 0;

		const before = tpl.slice(lastIndex, start);
		if (before) {
			const { value: mapped, finalAlign } = mapWithAlignTracking(before, currentAlign);
			currentAlign = finalAlign;
			if (mapped) jobs.push({ type: 'text', value: mapped });
		}

		let base64OrPlaceholder = String(content ?? '').trim();
		const placeholderKey = base64OrPlaceholder.match(/^\{\{(.+?)\}\}$/)?.[1];
		if (placeholderKey && placeholderBase64Map?.[placeholderKey]) {
			base64OrPlaceholder = placeholderBase64Map[placeholderKey];
		}

		const width = parseImgWidth(openTag) ?? defaultImageWidth;

		const base64 = stripNewlines(stripDataUriPrefix(base64OrPlaceholder));
		// Include current alignment so the print loop can pass it to the native module.
		jobs.push({ type: 'imageBase64', base64, imageWidth: width, align: currentAlign });

		lastIndex = start + full.length;
	}

	const tail = tpl.slice(lastIndex);
	if (tail) {
		const { value: mapped } = mapWithAlignTracking(tail, currentAlign);
		if (mapped) jobs.push({ type: 'text', value: mapped });
	}

	return jobs;
};
