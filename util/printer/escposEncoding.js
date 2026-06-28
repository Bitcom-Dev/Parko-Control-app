// util/printer/escposEncoding.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiny ESC/POS text encoder for Datecs DPP-450 (CP852 / CP1250 code pages).
// Replaces the EPToolkit usage from the old `react-native-thermal-receipt-printer-image-qr`
// library, which was a frequent source of crashes (no UTF-8 fallback handling).
//
// Why we need this: React Native runs in JS, but our native module wants raw bytes
// as base64. We:
//   1. Build a single byte stream with ESC/POS control bytes for the printer.
//   2. Encode Latin-1-ish text via a small CP852 lookup (covering all Romanian glyphs).
//   3. base64-encode the stream so the native side just `Base64.decode` + `write`.
// ─────────────────────────────────────────────────────────────────────────────

import { Buffer } from 'buffer';

// CP852 (Latin-2) covers all Romanian glyphs the DPP-450 uses.
// We hard-code only the printable subset that can show up in receipts — anything
// outside CP852 is replaced with '?' to avoid sending garbage bytes.
const CP852_OVERRIDES = {
	// Romanian / Polish / Czech subset most relevant to Romanian receipts:
	'\u0102': 0xC6, // Ă
	'\u0103': 0xC7, // ă
	'\u00C2': 0xB6, // Â
	'\u00E2': 0xB7, // â
	'\u00CE': 0xD6, // Î
	'\u00EE': 0xD7, // î
	'\u0218': 0xB8, // Ș (S-comma)  — sometimes Ş(0xA7) on older firmware
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

export const encodeTextCp852 = (text) => {
	const s = PUNCT_NORMALIZE(String(text || ''));
	const buf = Buffer.alloc(s.length);
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const code = s.charCodeAt(i);
		if (code < 0x80) {
			buf[i] = code;
		} else if (CP852_OVERRIDES[ch] !== undefined) {
			buf[i] = CP852_OVERRIDES[ch];
		} else {
			buf[i] = 0x3F; // '?'
		}
	}
	return buf;
};

// ESC/POS opcodes we care about.
export const ESC = 0x1B;
export const GS = 0x1D;

export const HW_INIT = Buffer.from([ESC, 0x40]);                  // initialize
export const SELECT_CP852 = Buffer.from([ESC, 0x74, 0x12]);       // ESC t 18 → CP852
export const LF = Buffer.from([0x0A]);

export const ALIGN = (n) => Buffer.from([ESC, 0x61, n & 0xFF]);    // 0=L 1=C 2=R
export const BOLD = (on) => Buffer.from([ESC, 0x45, on ? 1 : 0]);
export const UNDERLINE = (on) => Buffer.from([ESC, 0x2D, on ? 1 : 0]);
// GS ! n — selects width×height multiplier (0x00=1x1, 0x01=2x1, 0x10=1x2, 0x11=2x2).
export const SIZE = (w2x, h2x) =>
	Buffer.from([GS, 0x21, ((w2x ? 1 : 0) << 4) | (h2x ? 1 : 0)]);
export const FONT = (b) => Buffer.from([ESC, 0x4D, b ? 1 : 0]); // 0=Font A, 1=Font B
export const RESET_STYLE = Buffer.from([
	ESC, 0x45, 0,          // bold off
	ESC, 0x2D, 0,          // underline off
	GS, 0x21, 0,           // size 1x1
	ESC, 0x4D, 0,          // font A
]);

// Compose a header that resets the printer + selects the code page in one shot.
export const startupBytes = () =>
	Buffer.concat([HW_INIT, SELECT_CP852, ALIGN(0)]);

// Convenient base64 wrappers used by the JS print loop.
export const toBase64 = (bufOrBufs) => {
	const buf = Buffer.isBuffer(bufOrBufs)
		? bufOrBufs
		: Buffer.concat(bufOrBufs.map((b) => (Buffer.isBuffer(b) ? b : Buffer.from(b))));
	return buf.toString('base64');
};
