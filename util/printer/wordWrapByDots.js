export const wordWrapByDots = (textTemplate, maxDots = 832) => {
	if (!textTemplate) return '';

	let currentBaseWidth = 12; // Font A
	let currentMultiplier = 1; // Becomes 2 on <w2x> or <big>
	let currentLineDots = 0;
	let textFinal = '';
	let inImg = false;

	const isTag = (t) => typeof t === 'string' && t.startsWith('<') && t.endsWith('>');
	const isNewline = (t) => t === '\n' || t === '\r\n';
	const isSpaces = (t) => typeof t === 'string' && /^[ \t]+$/.test(t);
	// Count only characters that will actually be printed — strip any tag-like sequences.
	const printableLength = (str) => (str ? str.replace(/<[^>]*>/g, '').length : 0);
	const isWordLike = (t) => {
		if (typeof t !== 'string') return false;
		if (!t) return false;
		if (isTag(t) || isNewline(t) || isSpaces(t)) return false;
		// Count as a word if it contains at least one letter/number (avoid treating pure punctuation as a word).
		return /[0-9A-Za-zĂÂÎȘȚăâîșț]/.test(t);
	};

	// Keep a parallel representation of the current line so we can backtrack one word
	// when the next token doesn't fit (helps avoid awkward breaks like:
	// "... prin selectare\n<b>" -> becomes "... prin\nselectare <b>" ).
	/** @type {Array<{ token: string, dots: number }>} */
	let currentLine = [];
	const flushCurrentLine = () => {
		for (const item of currentLine) textFinal += item.token;
		currentLine = [];
		currentLineDots = 0;
	};

	const pushToLine = (token, dots) => {
		currentLine.push({ token, dots });
		currentLineDots += dots;
	};

	const hardBreakOversizeToken = (token, dotsPerChar) => {
		if (!token) return;
		const charsPerFullLine = Math.max(1, Math.floor(maxDots / dotsPerChar));

		// If there is already content on the current line, start the oversize token on a new line.
		if (currentLine.length > 0) {
			flushCurrentLine();
			textFinal += '\n';
		}

		let pos = 0;
		while (pos < token.length) {
			const chunk = token.slice(pos, pos + charsPerFullLine);
			pushToLine(chunk, printableLength(chunk) * dotsPerChar);
			pos += charsPerFullLine;
			if (pos < token.length) {
				flushCurrentLine();
				textFinal += '\n';
			}
		}
	};

	const trimLineTrailingSpaces = () => {
		while (currentLine.length > 0 && isSpaces(currentLine[currentLine.length - 1].token)) {
			currentLineDots -= currentLine[currentLine.length - 1].dots;
			currentLine.pop();
		}
	};

	const trimTokenLeadingSpaces = (token) => {
		if (!isSpaces(token)) return token;
		// preserve indentation? receipts don't use indentation; keep it simple.
		return '';
	};

	const tryBacktrackOneWordToNextLine = () => {
		// We backtrack the last "word segment" (last word + any spaces/tags after it)
		// only if the line would still have at least one word remaining.
		if (currentLine.length === 0) return false;

		// Find last word-like token in the line.
		let wordIdx = -1;
		for (let j = currentLine.length - 1; j >= 0; j--) {
			if (isWordLike(currentLine[j].token)) {
				wordIdx = j;
				break;
			}
		}
		if (wordIdx <= 0) return false;

		// Ensure there is at least one earlier word in the line.
		let hasEarlierWord = false;
		for (let j = wordIdx - 1; j >= 0; j--) {
			if (isWordLike(currentLine[j].token)) {
				hasEarlierWord = true;
				break;
			}
		}
		if (!hasEarlierWord) return false;

		// Move from the last word to the end of line.
		const moved = currentLine.splice(wordIdx);
		let movedDots = 0;
		for (const item of moved) movedDots += item.dots;
		currentLineDots -= movedDots;
		trimLineTrailingSpaces();

		// Flush previous line, start a new line with moved segment.
		for (const item of currentLine) textFinal += item.token;
		textFinal += '\n';
		currentLine = moved;
		currentLineDots = movedDots;
		// Trim leading spaces on the new line segment (avoid starting a line with whitespace).
		while (currentLine.length > 0 && isSpaces(currentLine[0].token)) {
			currentLineDots -= currentLine[0].dots;
			currentLine.shift();
		}
		return true;
	};

	// Keep tags and whitespace as tokens.
	const tokens = String(textTemplate)
		.split(/(<[^>]+>|\r?\n|[ \t]+)/)
		.filter((t) => t && t.length > 0);

	for (let i = 0; i < tokens.length; i++) {
		let token = tokens[i];

		// Avoid orphan single-letter words like "a" by gluing them to the next word.
		// Example: "... 13:51:12 a fost ..." should not become a line with only "a".
		if (!inImg && token && !isTag(token)) {
			const next = tokens[i + 1];
			const nextNext = tokens[i + 2];
			// Keep this conservative and Hermes-friendly (avoid Unicode property escapes).
			const isSingleLetterWord =
				token.length === 1 && /[A-Za-zĂÂÎȘȚăâîșț]/.test(token);
			const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(token);
			const nextIsSpaces = isSpaces(next);
			const nextNextIsWord =
				typeof nextNext === 'string' &&
				nextNext.length > 0 &&
				!isTag(nextNext) &&
				!isNewline(nextNext) &&
				!isSpaces(nextNext);
			const nextNextIsTime =
				typeof nextNext === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(nextNext);

			// 1) Glue a single-letter word with the following word ("a fost" stays together).
			if (isSingleLetterWord && nextIsSpaces && nextNextIsWord) {
				token = `${token} ${nextNext}`;
				i += 2;
				// fall through to section C (same as the date+time case below)
			}

			// 2) Glue ISO date + time so we never wrap between date and hour.
			// Example: "2026-02-23 13:51:12" must remain a single wrap unit.
			if (isIsoDate && nextIsSpaces && nextNextIsTime) {
				token = `${token} ${nextNext}`;
				i += 2;
			}
		}

		// A) pseudo-HTML tags
		if (isTag(token)) {
			const lower = token.toLowerCase();
			if (lower.startsWith('<img')) {
				inImg = true;
				pushToLine(token, 0);
				continue;
			}
			if (lower === '</img>') {
				inImg = false;
				pushToLine(token, 0);
				continue;
			}

			pushToLine(token, 0);

			if (token === '<font-a>') currentBaseWidth = 12;
			if (token === '<font-b>') currentBaseWidth = 9;
			// Only width-doubling commands affect horizontal wrapping.
			// <h2x> is height-only in ESC/POS and should NOT change the width multiplier.
			if (token === '<w2x>' || token === '<big>') currentMultiplier = 2;

			if (token === '<norm>') {
				currentBaseWidth = 12;
				currentMultiplier = 1;
			}
			continue;
		}

		// Never wrap inside <img>...</img>
		if (inImg) {
			pushToLine(token, 0);
			continue;
		}

		// B) explicit newline
		if (token === '\n' || token === '\r\n') {
			flushCurrentLine();
			textFinal += token;
			continue;
		}

		// C) word or spaces
		const dotsPerChar = currentBaseWidth * currentMultiplier;
		const tokenDots = printableLength(token) * dotsPerChar;

		// If a single token exceeds the line width (e.g. long dashed separators),
		// hard-break it so we never emit a line that is wider than maxDots.
		if (tokenDots > maxDots && token.trim() !== '') {
			hardBreakOversizeToken(token, dotsPerChar);
			continue;
		}

		if (currentLineDots + tokenDots > maxDots) {
			if (token.trim() === '') {
				// Wrap break: start a new line, but don't carry leading whitespace.
				flushCurrentLine();
				textFinal += '\n';
			} else {
				// Flush current line and put the overflowing token on the next line.
				flushCurrentLine();
				textFinal += '\n';
				// Ensure we don't start a line with spaces.
				const trimmed = trimTokenLeadingSpaces(token);
				if (trimmed) pushToLine(trimmed, tokenDots);
			}
		} else {
			pushToLine(token, tokenDots);
		}
	}

	flushCurrentLine();
	return textFinal;
};
