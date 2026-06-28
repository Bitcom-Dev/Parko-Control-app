// util/printer/escposEncoding.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiny ESC/POS text encoder for Datecs DPP-450 (CP852 / CP1250 code pages).
//
// IMPORTANT: this module is base64-encoder-self-contained. It does NOT rely on
// Buffer.toString('base64') because the React Native `buffer` polyfill can lose
// the Buffer prototype across .subarray() and slice() calls, producing the
// dreaded `IllegalArgumentException: bad base-64` from the native side.
// We implement a pure-JS base64 encoder over Uint8Array instead.
// ─────────────────────────────────────────────────────────────────────────────

// CP852 (Latin-2) covers all Romanian glyphs the DPP-450 uses.
// We hard-code only the printable subset that can show up in receipts — anything
// outside CP852 is replaced with '?' to avoid sending garbage bytes.
const CP852_OVERRIDES = {
	'\u0102': 0xC6, // Ă
	'\u0103': 0xC7, // ă
	'\u00C2': 0xB6, // Â
	'\u00E2': 0xB7, // â
	'\u00CE': 0xD6, // Î
	'\u00EE': 0xD7, // î
	'\u0218': 0xB8, // Ș (S-comma)
	'\u0219': 0xAD, // ș
	'\u015E': 0xA7, // Ş
	'\u015F': 0xA8, // ş
	'\u021A': 0xDD, // Ț (T-comma)
	'\u021B': 0xEE, // ț
	'\u0162': 0xDE, // Ţ
	'\u0163': 0xEF, // ţ
	'\u00C4': 0x8E,
	'\u00E4': 0x84,
	'\u00C9': 0x90,
	'\u00E9': 0x82,
	'\u00D6': 0x99,
	'\u00F6': 0x94,
	'\u00DC': 0x9A,
	'\u00FC': 0x81,
	'\u00DF': 0xE1,
};

const PUNCT_NORMALIZE = (s) =>
	String(s)
		.replace(/\u00A0/g, ' ')
		.replace(/\u200B/g, '')
		.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/g, '"')
		.replace(/[\u2013\u2014\u2212]/g, '-')
		.replace(/\u2026/g, '...');

// ─── Bytes builder ─────────────────────────────────────────────────────────
// We work with plain Uint8Array everywhere; concat is explicit.

export const bytes = (...arr) => Uint8Array.from(arr);

export const concatBytes = (parts) => {
	let total = 0;
	for (const p of parts) total += p.length;
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
};

// ─── Pure-JS base64 encoder over Uint8Array ────────────────────────────────
// This avoids the RN `buffer` polyfill bugs around .subarray()/.toString().

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const uint8ToBase64 = (u8) => {
	if (!u8 || u8.length === 0) return '';
	let out = '';
	const len = u8.length;
	let i = 0;
	// Process full 3-byte groups.
	for (; i + 2 < len; i += 3) {
		const b0 = u8[i];
		const b1 = u8[i + 1];
		const b2 = u8[i + 2];
		out += B64_CHARS[b0 >> 2];
		out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
		out += B64_CHARS[((b1 & 0x0F) << 2) | (b2 >> 6)];
		out += B64_CHARS[b2 & 0x3F];
	}
	// Handle tail (1 or 2 bytes).
	const rem = len - i;
	if (rem === 1) {
		const b0 = u8[i];
		out += B64_CHARS[b0 >> 2];
		out += B64_CHARS[(b0 & 0x03) << 4];
		out += '==';
	} else if (rem === 2) {
		const b0 = u8[i];
		const b1 = u8[i + 1];
		out += B64_CHARS[b0 >> 2];
		out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
		out += B64_CHARS[(b1 & 0x0F) << 2];
		out += '=';
	}
	return out;
};

// ─── Text → CP852 bytes ────────────────────────────────────────────────────

export const encodeTextCp852 = (text) => {
	const s = PUNCT_NORMALIZE(String(text || ''));
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const code = s.charCodeAt(i);
		if (code < 0x80) {
			out[i] = code;
		} else if (CP852_OVERRIDES[ch] !== undefined) {
			out[i] = CP852_OVERRIDES[ch];
		} else {
			out[i] = 0x3F; // '?'
		}
	}
	return out;
};

// ─── ESC/POS opcodes ───────────────────────────────────────────────────────

export const ESC = 0x1B;
export const GS = 0x1D;

export const HW_INIT      = bytes(ESC, 0x40);          // initialize
export const SELECT_CP852 = bytes(ESC, 0x74, 0x12);    // ESC t 18 → CP852
export const LF           = bytes(0x0A);

export const ALIGN     = (n)        => bytes(ESC, 0x61, n & 0xFF);                                            // 0=L 1=C 2=R
export const BOLD      = (on)       => bytes(ESC, 0x45, on ? 1 : 0);
export const UNDERLINE = (on)       => bytes(ESC, 0x2D, on ? 1 : 0);
export const SIZE      = (w2x, h2x) => bytes(GS, 0x21, ((w2x ? 1 : 0) << 4) | (h2x ? 1 : 0));
export const FONT      = (b)        => bytes(ESC, 0x4D, b ? 1 : 0);                                            // 0=Font A, 1=Font B
export const RESET_STYLE = bytes(
	ESC, 0x45, 0,   // bold off
	ESC, 0x2D, 0,   // underline off
	GS,  0x21, 0,   // size 1x1
	ESC, 0x4D, 0,   // font A
);

// Compose a header that resets the printer + selects the code page in one shot.
export const startupBytes = () => concatBytes([HW_INIT, SELECT_CP852, ALIGN(0)]);

// Convenient base64 wrapper used by the JS print loop.
// Accepts a single Uint8Array or an array of Uint8Arrays.
export const toBase64 = (input) => {
	if (input instanceof Uint8Array) return uint8ToBase64(input);
	if (Array.isArray(input)) return uint8ToBase64(concatBytes(input));
	throw new Error('toBase64: expected Uint8Array or array of Uint8Array');
};
