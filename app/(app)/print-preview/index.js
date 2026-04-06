import {
	View,
	ScrollView,
	Image,
	ActivityIndicator,
	Dimensions,
	Text,
	Pressable,
	Modal,
	FlatList,
	Platform,
	PermissionsAndroid,
	Alert,
	StyleSheet,
} from 'react-native';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';

import {
	BLEPrinter,
	COMMANDS as THERMAL_COMMANDS,
} from 'react-native-thermal-receipt-printer-image-qr';

import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resize, general } from '../../../util/style';
import { purple, white, black, orange, green, red, lightOrange, gray } from '../../../util/colors';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useMessage } from '../../../util/messages';

import { getPrintPreview } from '../../../util/printPreviewStore';
import { wordWrapByDots } from '../../../util/printer/wordWrapByDots';
import { buildThermalPrintJobsFromWrappedTemplate } from '../../../util/printer/thermalTemplateToJobs';
import { getValueAsync, setValueAsync, removeValueAsync } from '../../../util/storage';

const DEFAULT_DOTS = 832;
const DOTS_PER_CHAR_A = 12;
const DOTS_PER_CHAR_B = 9;
const DOTS_HEIGHT_A = 24;
const DOTS_HEIGHT_B = 17;

// Use a bundled monospace font with full Romanian glyph coverage.
// Loaded globally in `app/_layout.js` via `useFonts`.
const monoFontRegular = 'RobotoMono_400Regular';
const monoFontBold = 'RobotoMono_700Bold';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.trunc(n)));

const STORAGE_KEYS = {
	bleMac: 'printer_ble_inner_mac_address',
	bleName: 'printer_ble_device_name',
};

// Many thermal printers do NOT support real UTF-8.
// For Datecs / many ESC-POS printers, a good first try is CP852 + ESC t 18.
// If diacritics are still wrong, try other profiles (e.g. CP1250 with a different code table).
const PRINTER_ENCODING = 'CP852';
// ESC/POS: Select character code table (ESC t n). Common mapping: 18 => CP852.
// NOTE: The exact code table numbers vary by printer firmware; if needed, tweak this.
const PRINTER_CODE_TABLE = 18;
const PRINTER_PRINT_OPTS = {
	encoding: PRINTER_ENCODING,
	beep: false,
	cut: false,
	tailingLine: false,
};

const makeSelectCodeTable = (COMMANDS) => {
	const esc = COMMANDS?.ESC ?? '\x1b';
	return `${esc}t${String.fromCharCode(PRINTER_CODE_TABLE)}`;
};

const withPrinterCodeTable = (s, COMMANDS) => `${makeSelectCodeTable(COMMANDS)}${String(s)}`;

const normalizeRomanianForLegacyCodepages = (s) =>
	String(s)
		.replace(/\u0218/g, '\u015E') // Ș -> Ş
		.replace(/\u0219/g, '\u015F') // ș -> ş
		.replace(/\u021A/g, '\u0162') // Ț -> Ţ
		.replace(/\u021B/g, '\u0163'); // ț -> ţ

// Many templates/users end up with “smart quotes” (e.g. „ ” / “ ”) or NBSP.
// CP852/CP1250 printer codepages often can't represent these, so the printer outputs "??".
// Normalize to plain ASCII equivalents before encoding.
const normalizeUnicodePunctuationForEscPos = (s) =>
	String(s)
		.replace(/\u00A0/g, ' ') // NBSP
		.replace(/\u200B/g, '') // zero-width space
		.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'") // curly single quotes/prime -> '
		.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/g, '"') // curly double quotes/guillemets/double-prime -> "
		.replace(/[\u2013\u2014\u2212]/g, '-') // en/em dash/minus -> hyphen
		.replace(/\u2026/g, '...'); // ellipsis

const normalizeTextForEscPos = (s) =>
	normalizeUnicodePunctuationForEscPos(normalizeRomanianForLegacyCodepages(s));

// Race a promise against a timeout; rejects with a friendly message on expiry.
const withTimeout = (promise, ms, message) =>
	Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error(message || `Operation timed out after ${ms / 1000}s`)),
				ms,
			),
		),
	]);

// Small delay to let the BLE stack settle between writes.
// Saturating BLE with back-to-back writes is a common cause of disconnects.
const blePause = (ms = 80) => new Promise((r) => setTimeout(r, ms));

// Wrapper for any BLE printer call: adds a timeout and a single retry on transient failure.
const safeBleCall = async (fn, { timeoutMs = 10000, timeoutMsg = 'Printer communication timed out.', retries = 1 } = {}) => {
	let lastErr;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const result = await withTimeout(fn(), timeoutMs, timeoutMsg);
			return result;
		} catch (e) {
			lastErr = e;
			const msg = String(e?.message || '').toLowerCase();
			// Only retry on transient BLE/GATT errors, not on logic errors.
			const isTransient =
				msg.includes('gatt') ||
				msg.includes('133') ||
				msg.includes('timeout') ||
				msg.includes('timed out') ||
				msg.includes('disconnect') ||
				msg.includes('not connected') ||
				msg.includes('connection');
			if (!isTransient || attempt >= retries) break;
			// Brief pause before retry.
			await blePause(300);
		}
	}
	throw lastErr;
};

const ensureAndroidBluetoothPermissions = async () => {
	if (Platform.OS !== 'android') return true;

	try {
		const sdkInt = Number(Platform.Version);
		const perms = [];

		// Android 12+ (API 31+): BLUETOOTH_CONNECT is runtime.
		if (sdkInt >= 31) {
			perms.push(
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
			);
		} else {
			// Older Android: scanning often requires location permission.
			perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
		}

		const results = await PermissionsAndroid.requestMultiple(perms);
		const ok = perms.every((p) => results?.[p] === PermissionsAndroid.RESULTS.GRANTED);
		return ok;
	} catch (e) {
		console.warn('[print-preview] permission request error', e);
		return false;
	}
};

const getDeviceMac = (device) =>
	device?.inner_mac_address || device?.macAddress || device?.mac || device?.address;

const findBleDeviceByMac = (deviceList, mac) => {
	if (!Array.isArray(deviceList) || !mac) return null;
	const target = String(mac).toLowerCase();
	return (
		deviceList.find((d) => String(getDeviceMac(d) || '').toLowerCase() === target) ?? null
	);
};

const parseImgWidthDots = (tag) => {
	const m = String(tag).match(/width\s*=\s*(\d+)/i);
	return m ? Number(m[1]) : null;
};

const guessImageMime = (base64) => {
	const s = String(base64).trim();
	if (s.startsWith('iVBORw0KGgo')) return 'image/png';
	if (s.startsWith('/9j/')) return 'image/jpeg';
	return 'image/jpeg';
};

const roundDownToMultiple = (n, multiple) => {
	const x = Math.trunc(Number(n) || 0);
	const m = Math.trunc(Number(multiple) || 0);
	if (m <= 1) return x;
	return x - (x % m);
};

const getImageSizeFromBase64 = (base64) => {
	const b64 = String(base64 || '').trim();
	if (!b64) return Promise.resolve(null);

	const mime = guessImageMime(b64);
	const uri = `data:${mime};base64,${b64}`;
	return new Promise((resolve) => {
		Image.getSize(
			uri,
			(w, h) => (w > 0 && h > 0 ? resolve({ width: w, height: h }) : resolve(null)),
			() => resolve(null),
		);
	});
};

const isTag = (t) => typeof t === 'string' && t.startsWith('<') && t.endsWith('>');
const isNewline = (t) => t === '\n' || t === '\r\n';

const tokenizeReceipt = (tpl) => {
	// Keep tags + newlines as tokens, preserve normal text chunks.
	const parts = String(tpl).split(/(<img[^>]*>|<\/img>|<[^>]+>|\r?\n)/g);
	return parts.filter((p) => p !== undefined && p !== null && p !== '');
};

const defaultState = () => ({
	align: 'left',
	bold: false,
	underline: false,
	font: 'a',
	width2x: false,
	height2x: false,
});

const stateToTextStyleKey = (st) =>
	`${st.font}|${st.width2x ? 'w2x' : 'w1x'}|${st.height2x ? 'h2x' : 'h1x'}|${st.bold ? 'b' : 'n'}|${st.underline ? 'u' : 'n'}`;

const parseReceiptMarkup = (wrappedTemplate) => {
	const tokens = tokenizeReceipt(wrappedTemplate);
	const blocks = [];
	let st = defaultState();
	let currentLineRuns = [];

	const pushLine = () => {
		if (currentLineRuns.length === 0) {
			blocks.push({ type: 'blank' });
			return;
		}
		blocks.push({ type: 'text', align: st.align, runs: currentLineRuns });
		currentLineRuns = [];
	};

	const pushText = (txt) => {
		if (!txt) return;
		// Merge adjacent runs if style state didn't change.
		const key = stateToTextStyleKey(st);
		const last = currentLineRuns[currentLineRuns.length - 1];
		if (last && last.key === key) {
			last.text += txt;
			return;
		}
		currentLineRuns.push({
			key,
			text: txt,
			style: { ...st },
		});
	};

	let inImg = false;
	let imgTag = null;
	let imgContent = '';

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		if (inImg) {
			if (String(token).toLowerCase() === '</img>') {
				// Flush any pending text before image
				if (currentLineRuns.length > 0) pushLine();

				blocks.push({
					type: 'img',
					align: st.align,
					widthDots: parseImgWidthDots(imgTag),
					content: String(imgContent).trim(),
				});
				// After an image, printer naturally continues on next line.
				blocks.push({ type: 'blank' });

				inImg = false;
				imgTag = null;
				imgContent = '';
				continue;
			}

			imgContent += token;
			continue;
		}

		if (isNewline(token)) {
			pushLine();
			continue;
		}

		if (isTag(token)) {
			const t = String(token).toLowerCase();

			if (t.startsWith('<img')) {
				inImg = true;
				imgTag = token;
				imgContent = '';
				continue;
			}

			if (t === '<l>' || t === '<c>' || t === '<r>') {
				const nextAlign = t === '<l>' ? 'left' : t === '<c>' ? 'center' : 'right';
				// If we already have text in the current line, start a new line for new alignment.
				if (currentLineRuns.length > 0) pushLine();
				st.align = nextAlign;
				continue;
			}

			if (t === '<b>') st.bold = true;
			else if (t === '</b>') st.bold = false;
			else if (t === '<u>') st.underline = true;
			else if (t === '</u>') st.underline = false;
			else if (t === '<font-a>') st.font = 'a';
			else if (t === '<font-b>') st.font = 'b';
			// Match printer command semantics (see TXT_2HEIGHT / TXT_2WIDTH / TXT_4SQUARE)
			else if (t === '<h2x>') st.height2x = true;
			else if (t === '<w2x>') st.width2x = true;
			else if (t === '<big>') {
				st.width2x = true;
				st.height2x = true;
			}
			else if (t === '<norm>') {
				// TXT_NORMAL: reset size/style to default, but do NOT reset alignment.
				st.bold = false;
				st.underline = false;
				st.font = 'a';
				st.width2x = false;
				st.height2x = false;
			}

			continue;
		}

		pushText(token);
	}

	// Flush trailing content
	if (currentLineRuns.length > 0) blocks.push({ type: 'text', align: st.align, runs: currentLineRuns });
	return blocks;
};
const getCharDotsForStyle = (runStyle) => (runStyle?.font === 'b' ? DOTS_PER_CHAR_B : DOTS_PER_CHAR_A);

const getRunDotsWidth = ({ text, style }) => {
	const chars = String(text || '').length;
	const widthScale = style?.width2x ? 2 : 1;
	return chars * getCharDotsForStyle(style) * widthScale;
};

const getRunDotsHeight = (runStyle) => {
	const baseHeight = runStyle?.font === 'b' ? DOTS_HEIGHT_B : DOTS_HEIGHT_A;
	const heightScale = runStyle?.height2x ? 2 : 1;
	return baseHeight * heightScale;
};

const buildTextLineLayout = ({ runs, align, maxDots }) => {
	const cleanRuns = Array.isArray(runs)
		? runs.filter((r) => r && typeof r.text === 'string' && r.style)
		: [];
	if (cleanRuns.length === 0) return null;

	const lineHeightDots = cleanRuns.reduce(
		(mx, run) => Math.max(mx, getRunDotsHeight(run.style)),
		DOTS_HEIGHT_A,
	);

	return {
		runs: cleanRuns,
		align,
		lineHeightDots,
	};
};

const ReceiptImage = ({ base64OrPlaceholder, desiredWidthPx, align }) => {
	const [ratio, setRatio] = useState(null);

	const isPlaceholder = String(base64OrPlaceholder).includes('{{');
	if (isPlaceholder) {
		return (
			<View style={[styles.imgPlaceholder, { width: desiredWidthPx, alignSelf: alignToAlignSelf(align) }]}>
				<Text style={styles.imgPlaceholderText}>IMG: {String(base64OrPlaceholder).slice(0, 38)}...</Text>
			</View>
		);
	}

	const mime = guessImageMime(base64OrPlaceholder);
	const uri = `data:${mime};base64,${String(base64OrPlaceholder).trim()}`;

	useEffect(() => {
		let cancelled = false;
		Image.getSize(
			uri,
			(w, h) => {
				if (cancelled) return;
				if (w > 0 && h > 0) setRatio(w / h);
			},
			() => {
				if (cancelled) return;
				setRatio(null);
			},
		);
		return () => { cancelled = true; };
	}, [uri]);

	const heightPx = ratio ? desiredWidthPx / ratio : Math.round(desiredWidthPx * 0.35);

	return (
		<Image
			source={{ uri }}
			style={{ width: desiredWidthPx, height: heightPx, alignSelf: alignToAlignSelf(align) }}
			resizeMode="contain"
		/>
	);
};

const alignToAlignSelf = (align) => (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start');

const resolveRunStyle = ({ runStyle, pxPerDot, lineHeightPx }) => {
	const baseHeightDots = runStyle?.font === 'b' ? DOTS_HEIGHT_B : DOTS_HEIGHT_A;
	const fontSize = Math.max(4, Math.floor(baseHeightDots * pxPerDot * 0.9));
	const widthScale = runStyle?.width2x ? 2 : 1;
	const heightScale = runStyle?.height2x ? 2 : 1;
	return {
		fontFamily: runStyle?.bold ? monoFontBold : monoFontRegular,
		fontSize,
		lineHeight: lineHeightPx,
		textAlignVertical: 'center',
		color: '#111',
		textDecorationLine: runStyle?.underline ? 'underline' : 'none',
		includeFontPadding: false,
		...(widthScale !== 1 || heightScale !== 1
			? { transform: [{ scaleX: widthScale }, { scaleY: heightScale }] }
			: null),
	};
};

// ─── Shared print-loop executor ───────────────────────────────────────────────
// Extracted so both onPressPrint and onPickBleDevice use exactly the same
// protected print logic. Every BLE write is wrapped in safeBleCall (timeout + retry)
// with a small pause between writes to avoid saturating the BLE stack.
const executePrintJobs = async ({
	printTemplate,
	maxDots,
	COMMANDS,
	msg,
	getCachedImageSize,
}) => {
	const jobs = buildThermalPrintJobsFromWrappedTemplate({
		wrappedTemplate: printTemplate,
		COMMANDS,
		defaultImageWidth: Math.min(575, maxDots || 575),
	});

	// HW_INIT resets the printer state — always do this first.
	await safeBleCall(
		() =>
			BLEPrinter.printBill(
				withPrinterCodeTable(COMMANDS.HARDWARE.HW_INIT + COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT, COMMANDS),
				PRINTER_PRINT_OPTS,
			),
		{ timeoutMs: 8000, timeoutMsg: msg('printerProbeTimeout', 'Printer did not respond.') },
	);

	for (const job of jobs) {
		if (job.type === 'text') {
			if (job.value) {
				const v = normalizeTextForEscPos(String(job.value));
				await safeBleCall(
					() => BLEPrinter.printBill(withPrinterCodeTable(v, COMMANDS), PRINTER_PRINT_OPTS),
					{ timeoutMs: 10000, timeoutMsg: msg('printerProbeTimeout', 'Printer did not respond during text print.') },
				);
				await blePause();
			}
			continue;
		}
		if (job.type === 'imageBase64') {
			const base64 = String(job.base64 || '').trim();
			if (!base64) continue;
			if (base64.includes('{{')) {
				throw new Error(msg('missingImagePlaceholder', 'Missing image (placeholder) in template.'));
			}
			const requestedW = clampInt(Number(job.imageWidth) || 0, 1, 5000);
			const maxW = maxDots ? Math.min(requestedW, maxDots) : requestedW;
			const safeW = clampInt(roundDownToMultiple(maxW, 8) || maxW, 48, maxW || 575);
			const size = await getCachedImageSize(base64);
			const alignInt = job.align === 'center' ? 1 : job.align === 'right' ? 2 : 0;
			const opts = { imageWidth: safeW, alignment: alignInt };
			if (size?.width && size?.height) {
				opts.imageHeight = Math.max(1, Math.round((safeW * size.height) / size.width));
			} else {
				opts.imageHeight = Math.max(1, Math.round(safeW * 0.75));
			}
			await safeBleCall(
				() => BLEPrinter.printImageBase64(base64, opts),
				{ timeoutMs: 15000, timeoutMsg: msg('printerProbeTimeout', 'Printer did not respond during image print.'), retries: 1 },
			);
			// Images are larger payloads — give a longer pause.
			await blePause(150);
			continue;
		}
	}

	// Feed + reset after all jobs.
	await safeBleCall(
		() =>
			BLEPrinter.printBill(
				withPrinterCodeTable(
					normalizeTextForEscPos(`\n\n\n${COMMANDS.TEXT_FORMAT.TXT_NORMAL}`),
					COMMANDS,
				),
				PRINTER_PRINT_OPTS,
			),
		{ timeoutMs: 8000, timeoutMsg: msg('printerProbeTimeout', 'Printer did not respond during finalize.') },
	);
};

// ─── Screen ───────────────────────────────────────────────────────────────────
const PrintPreviewScreen = () => {
	const { PrintPreviewScreen: strings } = useMessage();
	const decodeEscapedNewlines = useCallback((value) => String(value ?? '').replace(/\\n/g, '\n'), []);
	const msg = useCallback(
		(key, fallback) => decodeEscapedNewlines(strings?.[key] || fallback),
		[decodeEscapedNewlines, strings],
	);
	const msgWith = useCallback(
		(key, fallback, vars = {}) => {
			const template = strings?.[key] || fallback;
			const rendered = Object.entries(vars).reduce(
				(acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? '')),
				String(template),
			);
			return decodeEscapedNewlines(rendered);
		},
		[decodeEscapedNewlines, strings],
	);
	const [data, setData] = useState(null);
	const [isPrinting, setIsPrinting] = useState(false);
	const [isReconnectingPrinter, setIsReconnectingPrinter] = useState(false);
	const [printerModalOpen, setPrinterModalOpen] = useState(false);
	const [bleDevices, setBleDevices] = useState([]);
	const [bleLoading, setBleLoading] = useState(false);
	const [bleError, setBleError] = useState(null);
	const [savedPrinterMac, setSavedPrinterMac] = useState(null);
	const [savedPrinterName, setSavedPrinterName] = useState('');
	const [printerConnectionStatus, setPrinterConnectionStatus] = useState('idle');
	const [printerConnectionMessage, setPrinterConnectionMessage] = useState('');
	const isConnectingPrinterRef = useRef(false);

	useEffect(() => {
		const d = getPrintPreview();
		setData(d);
	}, []);

	const maxDots = data?.dots_printer ? Number(data.dots_printer) : DEFAULT_DOTS;

	const screenWidth = Dimensions.get('window').width;
	// Scale paper width by printer dot width so different printers “feel” different.
	// Keep a hard clamp so it stays readable on phones.
	const maxPaperWidthPx = clamp(screenWidth - 24, 260, 520);
	const paperWidthScale = maxDots > 0 ? maxDots / DEFAULT_DOTS : 1;
	const paperWidthPx = clamp(maxPaperWidthPx * paperWidthScale, 220, maxPaperWidthPx);
	const paperPaddingX = 10; // keep in sync with `styles.paper.paddingHorizontal`
	const contentWidthPx = clamp(paperWidthPx - paperPaddingX * 2, 200, paperWidthPx);
	const pxPerDot = useMemo(() => {
		if (!maxDots || maxDots <= 0) return 0;
		return contentWidthPx / maxDots;
	}, [contentWidthPx, maxDots]);

	const wrappedTemplate = useMemo(() => {
		if (!data?.printed_nota) return '';
		return wordWrapByDots(String(data.printed_nota), maxDots);
	}, [data?.printed_nota, maxDots]);

	const printTemplate = wrappedTemplate;

	const blocks = useMemo(() => {
		if (!wrappedTemplate) return [];
		return parseReceiptMarkup(wrappedTemplate);
	}, [wrappedTemplate]);

	const resetBleConnection = useCallback(async () => {
		if (!BLEPrinter) return;
		const maybeCalls = [
			BLEPrinter.closeConn,
			BLEPrinter.closeConnection,
			BLEPrinter.disconnectPrinter,
			BLEPrinter.disconnect,
		];
		for (const fn of maybeCalls) {
			if (typeof fn !== 'function') continue;
			try {
				// Give each disconnect call 3 s max; if it hangs, move on.
				await withTimeout(fn(), 3000, 'disconnect timeout');
			} catch (_e) {
				// best-effort hard reset — ignore all errors
			}
		}
	}, []);

	const probeBleConnection = useCallback(async () => {
		if (!BLEPrinter || !THERMAL_COMMANDS) {
			throw new Error(msg('printerModuleUnavailable', 'Printer module is not available.'));
		}
		await withTimeout(
			BLEPrinter.printBill(
				withPrinterCodeTable(
					THERMAL_COMMANDS.HARDWARE.HW_INIT + THERMAL_COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT,
					THERMAL_COMMANDS,
				),
				PRINTER_PRINT_OPTS,
			),
			6000,
			msg('printerProbeTimeout', 'Printer did not respond. It may be off or out of paper.'),
		);
	}, [msg]);

	const connectToSavedPrinter = useCallback(
		async ({ openPickerOnMissing = false } = {}) => {
			if (isConnectingPrinterRef.current) {
				return { ok: false, reason: 'busy' };
			}
			isConnectingPrinterRef.current = true;

			try {
				if (Platform.OS !== 'android') {
					setPrinterConnectionStatus('disconnected');
					setPrinterConnectionMessage(msg('bleAndroidOnly', 'BLE connection is available on Android only.'));
					return { ok: false, reason: 'unsupported-platform' };
				}

				setPrinterConnectionStatus('checking');
				setPrinterConnectionMessage(msg('checkingPrinterConnection', 'Checking printer connection...'));

				const okPermissions = await ensureAndroidBluetoothPermissions();
				if (!okPermissions) {
					setPrinterConnectionStatus('disconnected');
					setPrinterConnectionMessage(msg('bluetoothPermissionsMissing', 'Bluetooth permissions are missing.'));
					return { ok: false, reason: 'permissions' };
				}

				const [mac, name] = await Promise.all([
					getValueAsync(STORAGE_KEYS.bleMac),
					getValueAsync(STORAGE_KEYS.bleName),
				]);

				setSavedPrinterMac(mac || null);
				setSavedPrinterName(name ? String(name) : '');

				if (!mac) {
					setPrinterConnectionStatus('disconnected');
					setPrinterConnectionMessage(msg('noSavedPrinter', 'No saved printer.'));
					if (openPickerOnMissing) setPrinterModalOpen(true);
					return { ok: false, reason: 'missing-saved-printer' };
				}

				if (!BLEPrinter || typeof BLEPrinter.init !== 'function' || typeof BLEPrinter.getDeviceList !== 'function') {
					throw new Error(msg('printerModuleUnavailable', 'Printer module is not available.'));
				}

				try { await resetBleConnection(); } catch (_) {}
				await withTimeout(
					BLEPrinter.init(),
					8000,
					msg('printerInitTimeout', 'Bluetooth adapter did not respond. Make sure Bluetooth is enabled.'),
				);
				const list = await withTimeout(
					BLEPrinter.getDeviceList(),
					10000,
					msg('printerScanTimeout', 'Bluetooth scan timed out. Make sure Bluetooth is enabled and permissions are granted.'),
				);
				const hit = findBleDeviceByMac(list, mac);

				if (!hit) {
					setPrinterConnectionStatus('disconnected');
					setPrinterConnectionMessage(msg('savedPrinterUnavailable', 'Saved printer is currently unavailable.'));
					setBleDevices(Array.isArray(list) ? list : []);
					if (openPickerOnMissing) setPrinterModalOpen(true);
					return { ok: false, reason: 'device-not-found' };
				}

				const deviceMac = String(getDeviceMac(hit));
				if (!deviceMac) {
					throw new Error(msg('invalidDeviceMissingAddress', 'Invalid device (missing address).'));
				}
				if (typeof BLEPrinter.connectPrinter !== 'function') {
					throw new Error(msg('printerModuleUnavailable', 'Printer module is not available.'));
				}

				// ⚠️  connectPrinter + probe can hang for 30 s+ if the printer is off,
				// and a native GATT timeout can crash the process entirely.
				// We race against a 12 s timeout so JS always regains control.
				try {
					await withTimeout(
						BLEPrinter.connectPrinter(deviceMac),
						12000,
						msg('printerConnectionTimeout', 'Could not connect to printer. Make sure it is turned on and in range.'),
					);
					await withTimeout(
						probeBleConnection(),
						8000,
						msg('printerProbeTimeout', 'Printer connected but did not respond. It may be off or out of paper.'),
					);
				} catch (connErr) {
					// Best-effort cleanup of any dangling GATT connection before propagating.
					try { await resetBleConnection(); } catch (_) {}
					throw connErr;
				}

				const nextName = String(hit?.device_name || hit?.name || name || msg('printerDefaultName', 'Printer'));
				setSavedPrinterMac(deviceMac);
				setSavedPrinterName(nextName);
				await setValueAsync(STORAGE_KEYS.bleMac, deviceMac);
				if (nextName) await setValueAsync(STORAGE_KEYS.bleName, nextName);

				setPrinterConnectionStatus('connected');
				setPrinterConnectionMessage(
					msgWith('connectedToPrinter', 'Connected: {{name}}', { name: nextName }),
				);
				return { ok: true, device: hit, mac: deviceMac, name: nextName };
			} catch (e) {
				console.warn('[print-preview] connect saved printer error', e);
				// Ensure native BLE state is cleaned up so next attempt starts fresh.
				try { await resetBleConnection(); } catch (_) {}
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(
					msgWith('invalidConnection', 'Invalid connection: {{error}}', { error: String(e?.message || e) }),
				);
				return { ok: false, reason: 'connect-failed', error: e };
			} finally {
				isConnectingPrinterRef.current = false;
			}
		},
		[msg, msgWith, probeBleConnection, resetBleConnection],
	);

	useEffect(() => {
		if (Platform.OS !== 'android') return;
		let cancelled = false;

		const run = async () => {
			try {
				const savedMac = await getValueAsync(STORAGE_KEYS.bleMac);
				const savedName = await getValueAsync(STORAGE_KEYS.bleName);
				if (cancelled) return;
				setSavedPrinterMac(savedMac || null);
				setSavedPrinterName(savedName ? String(savedName) : '');
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(msg('noSavedPrinter', 'No saved printer.'));
			} catch (e) {
				if (cancelled) return;
				console.warn('[print-preview] restore saved printer state error', e);
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(msg('noSavedPrinter', 'No saved printer.'));
			}
		};

		run();
		return () => {
			cancelled = true;
		};
	}, [connectToSavedPrinter, msg]);

	const onPressReconnectPrinter = useCallback(async () => {
		if (isPrinting) return;
		setIsReconnectingPrinter(true);
		try {
			const result = await connectToSavedPrinter({ openPickerOnMissing: true });
			if (result?.ok) {
				Alert.alert(
					msg('printerReconnectedTitle', 'Printer'),
					msg('printerReconnectedMessage', 'Printer connection has been restored.'),
				);
			}
		} catch (e) {
			console.warn('[print-preview] reconnect error', e);
			setPrinterConnectionStatus('disconnected');
			setPrinterConnectionMessage(String(e?.message || e));
			Alert.alert(
				msg('printTitle', 'Print'),
				msg('printerOffOrOutOfRange', '⚠️ Could not reach the printer.\n\nMake sure the printer is turned on and within Bluetooth range, then try again.'),
				[{ text: msg('ok', 'OK'), style: 'default' }],
				{ cancelable: true },
			);
		} finally {
			setIsReconnectingPrinter(false);
		}
	}, [connectToSavedPrinter, isPrinting, msg]);

	const printerStatusText = useMemo(() => {
		if (printerConnectionStatus === 'connected') {
			return printerConnectionMessage || msg('phoneConnectedToPrinter', 'Phone connected to printer.');
		}
		if (printerConnectionStatus === 'checking') {
			return printerConnectionMessage || msg('checkingConnection', 'Checking connection...');
		}
		if (savedPrinterMac) {
			const printerName = savedPrinterName ? ` (${savedPrinterName})` : '';
			return msgWith('phoneDisconnectedToPrinter', 'Phone not connected to printer{{nameSuffix}}.', {
				nameSuffix: printerName,
			});
		}
		return printerConnectionMessage || msg('noSavedPrinter', 'No saved printer.');
	}, [msg, msgWith, printerConnectionMessage, printerConnectionStatus, savedPrinterMac, savedPrinterName]);

	const onPressPrint = useCallback(() => {
		const run = async () => {
			if (Platform.OS === 'web') {
				Alert.alert(msg('printTitle', 'Print'), msg('printBluetoothUnavailableWeb', 'Bluetooth printing is not available on Web.'));
				return;
			}
			if (Platform.OS === 'ios') {
				Alert.alert(
					msg('printUnavailableIOS', '⚠️ Printing unavailable on iOS'),
					msg('printUnavailableIOSBody', 'Datecs DPP-450 uses Bluetooth Classic (SPP), which is not allowed for third-party apps on iOS due to Apple restrictions (MFi Program).\n\nYou can print the inspection note from an Android device.'),
					[{ text: msg('understood', 'Understood'), style: 'cancel' }],
					{ cancelable: true },
				);
				return;
			}
			if (!data?.printed_nota) return;

			if (Platform.OS === 'android') {
				const ok = await ensureAndroidBluetoothPermissions();
				if (!ok) {
					Alert.alert(
						msg('bluetoothPermissionsTitle', 'Bluetooth permissions'),
						msg('bluetoothPermissionsMessage', 'The app needs BLUETOOTH_CONNECT (and scan) permission to connect to the printer. Please accept permissions and try again.'),
					);
					return;
				}
			}

			setIsPrinting(true);
			try {
				const COMMANDS = THERMAL_COMMANDS;
				if (!BLEPrinter || !COMMANDS) {
					Alert.alert(msg('printTitle', 'Print'), msg('printerModuleUnavailable', 'Printer module is not available.'));
					return;
				}

				const imageSizeCache = new Map();
				const getCachedImageSize = async (base64) => {
					const key = String(base64 || '');
					if (imageSizeCache.has(key)) return imageSizeCache.get(key);
					const size = await getImageSizeFromBase64(key);
					imageSizeCache.set(key, size);
					return size;
				};

				const connection = await connectToSavedPrinter({ openPickerOnMissing: true });
				if (!connection?.ok) {
					if (connection?.reason === 'device-not-found') {
						setBleError(
							msg('savedPrinterNotFoundByBle', 'Saved printer was not found in BLE scan. If Datecs DPP-450 is Bluetooth Classic (SPP), it will not appear here.'),
						);
					}
					return;
				}

				await executePrintJobs({
					printTemplate,
					maxDots,
					COMMANDS,
					msg,
					getCachedImageSize,
				});

				Alert.alert(
					msg('printSentTitle', '✅ Inspection note sent'),
					msg('printSentMessage', 'The inspection note was sent to the printer.\n\nIf printing failed or issues occurred (paper jam, lost connection, etc.), you can retry by pressing the print button again.'),
					[{ text: msg('ok', 'OK'), style: 'default' }],
				);
			} catch (e) {
				console.warn('[print-preview] print error', e);
				// Clean up BLE state so next attempt starts fresh.
				try { await resetBleConnection(); } catch (_) {}
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(String(e?.message || e));
				const errMsg = String(e?.message || e);
				const isPrinterOff =
					errMsg.toLowerCase().includes('timeout') ||
					errMsg.toLowerCase().includes('timed out') ||
					errMsg.toLowerCase().includes('gatt') ||
					errMsg.toLowerCase().includes('133') ||
					errMsg.toLowerCase().includes('connect') ||
					errMsg.toLowerCase().includes('disconnect') ||
					errMsg.toLowerCase().includes('not connected');
				Alert.alert(
					msg('printTitle', 'Print'),
					isPrinterOff
						? msg('printerOffOrOutOfRange', '⚠️ Could not reach the printer.\n\nMake sure the printer is turned on, has paper, and is within Bluetooth range, then try again.')
						: msgWith('printErrorMessage', 'Print error: {{error}}\n\nIf the printer is Bluetooth Classic (SPP), BLE scan will not detect it.', {
								error: errMsg,
						  }),
					[{ text: msg('ok', 'OK'), style: 'default' }],
					{ cancelable: true },
				);
			} finally {
				setIsPrinting(false);
			}
		};

		run().catch((e) => {
			// Last-resort safety net — prevents unhandled promise rejections from crashing the app.
			console.warn('[print-preview] unhandled print error', e);
			setIsPrinting(false);
		});
	}, [connectToSavedPrinter, data?.printed_nota, maxDots, msg, msgWith, printTemplate, resetBleConnection]);

	const onForgetSavedPrinter = useCallback(async () => {
		try {
			await removeValueAsync(STORAGE_KEYS.bleMac);
			await removeValueAsync(STORAGE_KEYS.bleName);
			try { await resetBleConnection(); } catch (_) {}
			setSavedPrinterMac(null);
			setSavedPrinterName('');
			setPrinterConnectionStatus('disconnected');
			setPrinterConnectionMessage(msg('noSavedPrinter', 'No saved printer.'));
			Alert.alert(
				msg('printerReconnectedTitle', 'Printer'),
				msg('savedPrinterDeleted', 'Saved printer was removed.'),
			);
		} catch (e) {
			console.warn('[print-preview] forget printer error', e);
			Alert.alert(msg('printTitle', 'Print'), String(e?.message || e));
		}
	}, [msg, resetBleConnection]);

	const onRefreshBleDevices = useCallback(async () => {
		setBleError(null);
		setBleLoading(true);
		try {
			if (Platform.OS === 'android') {
				const ok = await ensureAndroidBluetoothPermissions();
				if (!ok) throw new Error('BLUETOOTH_CONNECT / SCAN not granted');
			}
			await withTimeout(
				BLEPrinter.init(),
				8000,
				'Bluetooth adapter did not respond. Make sure Bluetooth is enabled.',
			);
			const list = await withTimeout(
				BLEPrinter.getDeviceList(),
				10000,
				'Bluetooth scan timed out.',
			);
			setBleDevices(Array.isArray(list) ? list : []);
		} catch (e) {
			console.warn('[print-preview] refresh BLE devices error', e);
			setBleDevices([]);
			setBleError(String(e?.message || e));
		} finally {
			setBleLoading(false);
		}
	}, []);

	const onPickBleDevice = useCallback(
		async (device) => {
			const mac = getDeviceMac(device);
			const name = device?.device_name || device?.name || '';
			if (!mac) {
				Alert.alert(
					msg('printerReconnectedTitle', 'Printer'),
					msg('invalidDeviceMissingAddress', 'Invalid device (missing address).'),
				);
				return;
			}

			setPrinterModalOpen(false);
			setIsPrinting(true);
			try {
				const imageSizeCache = new Map();
				const getCachedImageSize = async (base64) => {
					const key = String(base64 || '');
					if (imageSizeCache.has(key)) return imageSizeCache.get(key);
					const size = await getImageSizeFromBase64(key);
					imageSizeCache.set(key, size);
					return size;
				};

				await setValueAsync(STORAGE_KEYS.bleMac, String(mac));
				if (name) await setValueAsync(STORAGE_KEYS.bleName, String(name));
				setSavedPrinterMac(String(mac));
				setSavedPrinterName(String(name || msg('printerDefaultName', 'Printer')));
				const COMMANDS = THERMAL_COMMANDS;
				try {
					await withTimeout(
						BLEPrinter.init(),
						8000,
						'Bluetooth adapter did not respond. Make sure Bluetooth is enabled.',
					);
					await withTimeout(
						BLEPrinter.connectPrinter(String(mac)),
						12000,
						'Could not connect to printer. Make sure it is turned on and in range.',
					);
				} catch (connErr) {
					try { await resetBleConnection(); } catch (_) {}
					throw connErr;
				}
				setPrinterConnectionStatus('connected');
				setPrinterConnectionMessage(
					msgWith('connectedToPrinter', 'Connected: {{name}}', {
						name: String(name || msg('printerDefaultName', 'Printer')),
					}),
				);

				await executePrintJobs({
					printTemplate,
					maxDots,
					COMMANDS,
					msg,
					getCachedImageSize,
				});

				Alert.alert(
					msg('printSentTitle', '✅ Inspection note sent'),
					msg('printSentMessage', 'The inspection note was sent to the printer.\n\nIf printing failed or issues occurred (paper jam, lost connection, etc.), you can retry by pressing the print button again.'),
					[{ text: msg('ok', 'OK'), style: 'default' }],
				);
			} catch (e) {
				console.warn('[print-preview] pick+print error', e);
				// Clean up BLE state so next attempt starts fresh.
				try { await resetBleConnection(); } catch (_) {}
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(String(e?.message || e));
				const errMsg = String(e?.message || e);
				const isPrinterOff =
					errMsg.toLowerCase().includes('timeout') ||
					errMsg.toLowerCase().includes('timed out') ||
					errMsg.toLowerCase().includes('gatt') ||
					errMsg.toLowerCase().includes('133') ||
					errMsg.toLowerCase().includes('connect') ||
					errMsg.toLowerCase().includes('disconnect') ||
					errMsg.toLowerCase().includes('not connected');
				Alert.alert(
					msg('printTitle', 'Print'),
					isPrinterOff
						? msg('printerOffOrOutOfRange', '⚠️ Could not reach the printer.\n\nMake sure the printer is turned on, has paper, and is within Bluetooth range, then try again.')
						: msgWith('printErrorMessage', 'Print error: {{error}}', { error: errMsg }),
					[{ text: msg('ok', 'OK'), style: 'default' }],
					{ cancelable: true },
				);
			} finally {
				setIsPrinting(false);
			}
		},
		[maxDots, msg, msgWith, printTemplate, resetBleConnection],
	);

	if (!data) {
		return (
			<View style={s.center}>
				<ActivityIndicator size="large" color={purple} />
				<CustomTextMedium style={s.centerText}>
					{strings?.loading || 'Loading preview...'}
				</CustomTextMedium>
			</View>
		);
	}

	if (!data?.printed_nota) {
		return (
			<View style={s.center}>
				<Text style={styles.errIcon}>!</Text>
				<CustomTextMedium style={s.centerText}>
					{strings?.missingTemplate || 'Missing template from server.'}
				</CustomTextMedium>
			</View>
		);
	}

	return (
		<View style={styles.screen}>
			<Stack.Screen
				options={{
					title: strings?.title || 'Print Preview',
					headerStyle: { backgroundColor: lightOrange },
					headerTintColor: purple,
					statusBarColor: lightOrange,
					statusBarStyle: 'dark',
					headerRight: () => (
						<Pressable
							onPress={() => setPrinterModalOpen(true)}
							hitSlop={10}
							style={{ marginRight: 12, padding: 4 }}
						>
							<Ionicons name="print-outline" size={24} color={purple} />
						</Pressable>
					),
				}}
			/>
			<Modal
				transparent
				visible={printerModalOpen}
				animationType="slide"
				onRequestClose={() => setPrinterModalOpen(false)}
			>
				<View style={styles.modalBackdrop}>
					<Pressable style={StyleSheet.absoluteFill} onPress={() => setPrinterModalOpen(false)} />
					<View style={styles.modalCard}>
						<View style={styles.modalHeader}>
							<View style={styles.modalHeaderDecorL} />
							<View style={styles.modalHeaderDecorR} />
							<View style={styles.modalHeaderIconWrap}>
								<Ionicons name="bluetooth" size={resize(15)} color={white} />
							</View>
							<CustomTextBold style={styles.modalTitle}>{msg('selectPrinterBle', 'Select Bluetooth Printer')}</CustomTextBold>
							<Pressable onPress={() => setPrinterModalOpen(false)} hitSlop={10} style={styles.modalCloseBtn}>
								<Ionicons name="close" size={resize(15)} color={white} />
							</Pressable>
						</View>

						<Text style={styles.modalHint}>
							{msg('classicBluetoothHint', 'Bluetooth Classic (SPP) printers (e.g. Datecs DPP) will not appear in this list.')}
						</Text>

						{savedPrinterMac ? (
							<View style={styles.savedPrinterSection}>
								<CustomTextMedium style={styles.sectionLabel}>{msg('savedPrinterLabel', 'Saved printer')}</CustomTextMedium>
								<View style={styles.savedPrinterCard}>
									<View style={styles.savedPrinterIconWrap}>
										<Ionicons name="print" size={resize(18)} color={purple} />
									</View>
									<View style={styles.savedPrinterInfo}>
										<CustomTextBold style={styles.savedPrinterName}>{savedPrinterName || msg('printerDefaultName', 'Printer')}</CustomTextBold>
										<Text style={styles.savedPrinterMacText}>{savedPrinterMac}</Text>
									</View>
									<Pressable
										onPress={onForgetSavedPrinter}
										hitSlop={10}
										style={({ pressed }) => [styles.forgetBtn, pressed && { opacity: 0.6 }]}
									>
										<Ionicons name="trash-outline" size={resize(17)} color={red} />
									</Pressable>
								</View>
							</View>
						) : null}

						{bleError ? <Text style={styles.modalError}>{bleError}</Text> : null}

						<View style={styles.devicesSection}>
							<View style={styles.devicesSectionHeader}>
								<CustomTextMedium style={styles.sectionLabel}>{msg('availableDevices', 'Available devices')}</CustomTextMedium>
								<Pressable
									onPress={onRefreshBleDevices}
									disabled={bleLoading}
									style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}
								>
									{bleLoading
										? <ActivityIndicator size={resize(13)} color={purple} style={{ marginRight: resize(4) }} />
										: <Ionicons name="refresh-outline" size={resize(14)} color={purple} style={{ marginRight: resize(4) }} />
									}
									<Text style={styles.scanBtnText}>{bleLoading ? msg('searching', 'Scanning...') : msg('reloadList', 'Scan')}</Text>
								</Pressable>
							</View>

							<FlatList
								data={bleDevices}
								keyExtractor={(item, idx) =>
									String(item?.inner_mac_address || item?.macAddress || item?.mac || item?.address || idx)
								}
								renderItem={({ item }) => {
									const name = item?.device_name || item?.name || msg('printerDefaultName', 'Printer');
									const mac = item?.inner_mac_address || item?.macAddress || item?.mac || item?.address;
									const isSaved = savedPrinterMac && String(mac || '').toLowerCase() === String(savedPrinterMac).toLowerCase();
									return (
										<Pressable
											onPress={() => onPickBleDevice(item)}
											style={({ pressed }) => [styles.deviceRow, isSaved && styles.deviceRowSaved, pressed && styles.deviceRowPressed]}
											disabled={isPrinting}
										>
											<View style={[styles.deviceIconWrap, isSaved && styles.deviceIconWrapSaved]}>
												<Ionicons name="bluetooth" size={resize(15)} color={isSaved ? white : purple} />
											</View>
											<View style={styles.deviceInfo}>
												<CustomTextBold style={[styles.deviceName, isSaved && styles.deviceNameSaved]}>{String(name)}</CustomTextBold>
												<Text style={[styles.deviceMac, isSaved && styles.deviceMacSaved]}>{String(mac || '')}</Text>
											</View>
											{isSaved
												? <View style={styles.deviceCheck}><Ionicons name="checkmark-circle" size={resize(18)} color={purple} /></View>
												: <Ionicons name="chevron-forward" size={resize(15)} color={gray} />
											}
										</Pressable>
									);
								}}
								ListEmptyComponent={
									bleLoading
										? <View style={styles.scanningState}>
											<ActivityIndicator size="large" color={purple} />
											<Text style={styles.scanningText}>{msg('searchingForDevices', 'Searching for devices...')}</Text>
										</View>
										: <View style={styles.emptyState}>
											<Ionicons name="bluetooth-outline" size={resize(36)} color={gray} />
											<Text style={styles.modalEmpty}>{msg('noBlePrintersFound', 'No BLE printers found.')}</Text>
											<Text style={styles.modalEmptyHint}>{msg('tapScanToSearch', 'Tap "Scan" to search for nearby printers.')}</Text>
										</View>
								}
								contentContainerStyle={{ paddingBottom: resize(24) }}
							/>
						</View>
					</View>
				</View>
			</Modal>

			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.meta}>
					<Text style={styles.metaText} allowFontScaling={false}>
						{`${msg('previewByDots', 'Preview 1:1 by dots')}  ·  ${msg('wrapDots', 'wrap dots')}: ${maxDots}`}
					</Text>
					<Text style={styles.metaText} allowFontScaling={false}>
						{`${msg('dotsLabel', 'dots')}: ${maxDots}  ·  ${msg('contentLabel', 'content')}: ${Math.round(contentWidthPx)}px  ·  ${pxPerDot ? pxPerDot.toFixed(3) : '0.000'} ${msg('pxPerDotLabel', 'px/dot')}`}
					</Text>
				</View>

				<View style={[styles.paper, { width: paperWidthPx }]}>
					{blocks.map((b, idx) => {
						if (!b || b.type === 'blank') {
							const blankLinePx = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: blankLinePx }} />;
						}

						if (b.type === 'img') {
							const widthDots = b.widthDots || maxDots;
							const desiredWidthPx = clamp((contentWidthPx * widthDots) / maxDots, 24, contentWidthPx);
							return (
								<View key={`img-${idx}`} style={styles.block}>
									<ReceiptImage
										base64OrPlaceholder={b.content}
										desiredWidthPx={desiredWidthPx}
										align={b.align}
									/>
								</View>
							);
						}

						// text
						const runs = Array.isArray(b?.runs)
							? b.runs.filter((r) => r && typeof r.text === 'string' && r.style)
							: [];
						if (b.type !== 'text' || runs.length === 0) {
							const blankLinePx = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: blankLinePx }} />;
						}

						const lineLayout = buildTextLineLayout({
							runs,
							align: b.align,
							maxDots,
						});
						if (!lineLayout) {
							const blankLinePx = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: blankLinePx }} />;
						}

						const lineHeightPx = Math.max(6, Math.round(lineLayout.lineHeightDots * pxPerDot));
						const textAlign =
							lineLayout.align === 'center'
								? 'center'
								: lineLayout.align === 'right'
									? 'right'
									: 'left';
						return (
							<View key={`txt-${idx}`} style={{ minHeight: lineHeightPx, width: contentWidthPx }}>
								<Text
									allowFontScaling={false}
									numberOfLines={1}
									ellipsizeMode="clip"
									style={[
										styles.lineText,
										{ left: 0, width: contentWidthPx, lineHeight: lineHeightPx, textAlign },
									]}
								>
									{lineLayout.runs.map((run, j) => (
										<Text
											key={`${idx}-${j}`}
											allowFontScaling={false}
											style={resolveRunStyle({ runStyle: run.style, pxPerDot, lineHeightPx })}
										>
											{run.text}
										</Text>
									))}
								</Text>
							</View>
						);
					})}
				</View>
			</ScrollView>

			<View style={styles.bottomBar}>
				<View style={styles.connectionRow}>
					<View
						style={[
							styles.connectionDot,
							printerConnectionStatus === 'connected'
								? styles.connectionDotConnected
								: printerConnectionStatus === 'checking'
									? styles.connectionDotChecking
									: styles.connectionDotDisconnected,
						]}
					/>
					<CustomTextMedium style={styles.connectionText}>{printerStatusText}</CustomTextMedium>
				</View>
				<View style={styles.buttonsRow}>
					<Pressable
						onPress={onPressReconnectPrinter}
						disabled={isPrinting || isReconnectingPrinter}
						style={({ pressed }) => [
							styles.reconnectButton,
							pressed && styles.printButtonPressed,
							(isPrinting || isReconnectingPrinter) && styles.printButtonDisabled,
						]}
						hitSlop={8}
					>
						{isReconnectingPrinter ? (
							<ActivityIndicator size="small" color={purple} />
						) : (
							<CustomTextBold style={styles.reconnectButtonText}>{msg('reconnect', 'Reconnect')}</CustomTextBold>
						)}
					</Pressable>
				<Pressable
					onPress={onPressPrint}
					disabled={isPrinting || printerConnectionStatus !== 'connected'}
					style={({ pressed }) => [
						styles.printButton,
						pressed && printerConnectionStatus === 'connected' && styles.printButtonPressed,
						(isPrinting || printerConnectionStatus !== 'connected') && styles.printButtonDisabled,
					]}
					hitSlop={8}
				>
					{isPrinting ? (
						<ActivityIndicator size="small" color={white} />
					) : (
						<CustomTextBold style={styles.printButtonText}>
							{strings?.print || 'Print'}
						</CustomTextBold>
					)}
				</Pressable>
				</View>
			</View>
		</View>
	);
};

const s = StyleSheet.create({
	center: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: resize(20),
		backgroundColor: lightOrange,
	},
	centerText: {
		...general.fontSize9,
		color: black,
		marginTop: resize(12),
		textAlign: 'center',
	},
});

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: lightOrange,
	},
	scroll: {
		flex: 1,
		width: '100%',
	},
	scrollContent: {
		paddingVertical: resize(14),
		paddingBottom: resize(86),
		alignItems: 'center',
	},
	bottomBar: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: resize(14),
		paddingTop: resize(12),
		paddingBottom: resize(16),
		backgroundColor: 'rgba(255,243,231,0.97)',
		borderTopLeftRadius: resize(18),
		borderTopRightRadius: resize(18),
		shadowColor: '#000',
		shadowOffset: { width: 0, height: -2 },
		shadowOpacity: 0.07,
		shadowRadius: 8,
		elevation: 6,
	},
	connectionRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 8,
		gap: 8,
	},
	connectionDot: {
		width: 9,
		height: 9,
		borderRadius: 5,
	},
	connectionDotConnected: {
		backgroundColor: green,
	},
	connectionDotChecking: {
		backgroundColor: orange,
	},
	connectionDotDisconnected: {
		backgroundColor: red,
	},
	connectionText: {
		flex: 1,
		fontSize: 12,
		color: black,
	},
	buttonsRow: {
		flexDirection: 'row',
		gap: 8,
	},
	reconnectButton: {
		flex: 1,
		height: resize(48),
		borderRadius: resize(14),
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: white,
		borderWidth: 1.5,
		borderColor: purple,
	},
	reconnectButtonText: {
		color: purple,
		...general.fontSize12,
	},
	printButton: {
		flex: 1,
		height: resize(48),
		borderRadius: resize(14),
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: purple,
	},
	printButtonPressed: {
		opacity: 0.9,
	},
	printButtonDisabled: {
		opacity: 0.7,
	},
	printButtonText: {
		color: white,
		...general.fontSize12,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.45)',
		justifyContent: 'flex-end',
	},
	modalCard: {
		backgroundColor: '#F8F4FF',
		borderTopLeftRadius: resize(28),
		borderTopRightRadius: resize(28),
		overflow: 'hidden',
		maxHeight: '88%',
		flex: 1,
	},
	modalHeader: {
		backgroundColor: purple,
		paddingTop: resize(14),
		paddingBottom: resize(14),
		paddingHorizontal: resize(16),
		flexDirection: 'row',
		alignItems: 'center',
		gap: resize(10),
		overflow: 'hidden',
	},
	modalHeaderDecorL: {
		position: 'absolute',
		width: resize(100),
		height: resize(100),
		borderRadius: resize(50),
		backgroundColor: 'rgba(255,255,255,0.07)',
		top: -resize(35),
		left: -resize(20),
	},
	modalHeaderDecorR: {
		position: 'absolute',
		width: resize(70),
		height: resize(70),
		borderRadius: resize(35),
		backgroundColor: 'rgba(255,255,255,0.07)',
		top: -resize(15),
		right: resize(60),
	},
	modalHeaderIconWrap: {
		width: resize(30),
		height: resize(30),
		borderRadius: resize(15),
		backgroundColor: 'rgba(255,255,255,0.18)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	modalTitle: {
		...general.fontSize14,
		color: white,
		flex: 1,
	},
	modalCloseBtn: {
		backgroundColor: 'rgba(255,255,255,0.2)',
		borderRadius: resize(20),
		padding: resize(7),
		alignItems: 'center',
		justifyContent: 'center',
	},
	modalHint: {
		...general.fontSize8,
		color: gray,
		marginHorizontal: resize(16),
		marginTop: resize(12),
		marginBottom: resize(4),
		lineHeight: resize(14),
	},
	modalError: {
		...general.fontSize8,
		color: red,
		marginHorizontal: resize(16),
		marginBottom: resize(8),
	},
	savedPrinterSection: {
		marginHorizontal: resize(16),
		marginTop: resize(14),
		marginBottom: resize(4),
	},
	sectionLabel: {
		...general.fontSize8,
		color: gray,
		marginBottom: resize(6),
		letterSpacing: 0.6,
	},
	savedPrinterCard: {
		backgroundColor: white,
		borderRadius: resize(16),
		paddingVertical: resize(12),
		paddingHorizontal: resize(14),
		flexDirection: 'row',
		alignItems: 'center',
		borderWidth: 1.5,
		borderColor: purple,
		shadowColor: purple,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.10,
		shadowRadius: 6,
		elevation: 3,
	},
	savedPrinterIconWrap: {
		width: resize(38),
		height: resize(38),
		borderRadius: resize(19),
		backgroundColor: lightOrange,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: resize(12),
	},
	savedPrinterInfo: {
		flex: 1,
	},
	savedPrinterName: {
		...general.fontSize12,
		color: black,
	},
	savedPrinterMacText: {
		...general.fontSize8,
		color: gray,
		marginTop: resize(2),
	},
	forgetBtn: {
		padding: resize(8),
		borderRadius: resize(10),
		backgroundColor: 'rgba(220,53,69,0.09)',
	},
	devicesSection: {
		flex: 1,
		marginTop: resize(14),
	},
	devicesSectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginHorizontal: resize(16),
		marginBottom: resize(8),
	},
	scanBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: resize(12),
		paddingVertical: resize(6),
		borderRadius: resize(20),
		backgroundColor: lightOrange,
		borderWidth: 1,
		borderColor: purple,
	},
	scanBtnText: {
		...general.fontSize10,
		color: purple,
	},
	deviceRow: {
		backgroundColor: white,
		borderRadius: resize(14),
		paddingVertical: resize(10),
		paddingHorizontal: resize(14),
		marginHorizontal: resize(16),
		marginBottom: resize(8),
		flexDirection: 'row',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 1,
	},
	deviceRowSaved: {
		borderWidth: 1.5,
		borderColor: purple,
		backgroundColor: lightOrange,
	},
	deviceRowPressed: {
		opacity: 0.75,
	},
	deviceIconWrap: {
		width: resize(34),
		height: resize(34),
		borderRadius: resize(17),
		backgroundColor: lightOrange,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: resize(12),
	},
	deviceIconWrapSaved: {
		backgroundColor: purple,
	},
	deviceInfo: {
		flex: 1,
	},
	deviceName: {
		...general.fontSize12,
		color: black,
	},
	deviceNameSaved: {
		color: purple,
	},
	deviceMac: {
		...general.fontSize8,
		color: gray,
		marginTop: resize(2),
	},
	deviceMacSaved: {
		color: purple,
		opacity: 0.7,
	},
	deviceCheck: {
		marginLeft: resize(6),
	},
	scanningState: {
		alignItems: 'center',
		paddingVertical: resize(32),
		gap: resize(12),
	},
	scanningText: {
		...general.fontSize10,
		color: gray,
	},
	emptyState: {
		alignItems: 'center',
		paddingVertical: resize(28),
		gap: resize(8),
	},
	modalEmpty: {
		textAlign: 'center',
		color: gray,
		...general.fontSize10,
	},
	modalEmptyHint: {
		textAlign: 'center',
		color: gray,
		...general.fontSize8,
		opacity: 0.75,
	},
	meta: {
		width: '100%',
		maxWidth: 520,
		paddingHorizontal: resize(12),
		marginBottom: resize(8),
	},
	metaText: {
		fontFamily: monoFontRegular,
		fontSize: resize(10),
		color: gray,
	},
	paper: {
		backgroundColor: '#FEFEFE',
		borderRadius: resize(12),
		paddingHorizontal: resize(10),
		paddingVertical: resize(10),
		borderWidth: 1,
		borderColor: '#e8e8e8',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 2,
	},
	block: {
		marginVertical: 2,
	},
	lineText: {
		position: 'absolute',
		top: 0,
		includeFontPadding: false,
		color: '#111',
	},
	imgPlaceholder: {
		borderWidth: 1,
		borderColor: '#D0D5DD',
		backgroundColor: '#F6F7F9',
		padding: 8,
		borderRadius: 8,
	},
	imgPlaceholderText: {
		fontFamily: monoFontRegular,
		fontSize: 12,
		color: '#667085',
	},
	errIcon: {
		fontSize: 42,
		color: orange,
		fontWeight: '800',
	},
});

export default PrintPreviewScreen;
