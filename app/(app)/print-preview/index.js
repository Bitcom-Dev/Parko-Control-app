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

import { resize, general } from '../../../util/style';
import { purple, white, black, orange, green, red } from '../../../util/colors';
import { CustomTextBold, CustomTextMedium } from '../../../util/CustomText';
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

// ─── Screen ───────────────────────────────────────────────────────────────────
const PrintPreviewScreen = () => {
	const { PrintPreviewScreen: strings } = useMessage();
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
				await fn();
			} catch (_e) {
				// best-effort hard reset
			}
		}
	}, []);

	const probeBleConnection = useCallback(async () => {
		if (!BLEPrinter || !THERMAL_COMMANDS) {
			throw new Error('Modulul de imprimantă nu este disponibil.');
		}
		await BLEPrinter.printBill(
			withPrinterCodeTable(
				THERMAL_COMMANDS.HARDWARE.HW_INIT + THERMAL_COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT,
				THERMAL_COMMANDS,
			),
			PRINTER_PRINT_OPTS,
		);
	}, []);

	const connectToSavedPrinter = useCallback(
		async ({ openPickerOnMissing = false } = {}) => {
			if (isConnectingPrinterRef.current) {
				return { ok: false, reason: 'busy' };
			}
			isConnectingPrinterRef.current = true;

			if (Platform.OS !== 'android') {
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage('Conectarea BLE este disponibilă doar pe Android.');
				isConnectingPrinterRef.current = false;
				return { ok: false, reason: 'unsupported-platform' };
			}

			setPrinterConnectionStatus('checking');
			setPrinterConnectionMessage('Se verifică conexiunea cu imprimanta...');

			const okPermissions = await ensureAndroidBluetoothPermissions();
			if (!okPermissions) {
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage('Lipsesc permisiunile Bluetooth.');
				isConnectingPrinterRef.current = false;
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
				setPrinterConnectionMessage('Nu există imprimantă salvată.');
				if (openPickerOnMissing) setPrinterModalOpen(true);
				isConnectingPrinterRef.current = false;
				return { ok: false, reason: 'missing-saved-printer' };
			}

			try {
				await resetBleConnection();
				await BLEPrinter.init();
				const list = await BLEPrinter.getDeviceList();
				const hit = findBleDeviceByMac(list, mac);

				if (!hit) {
					setPrinterConnectionStatus('disconnected');
					setPrinterConnectionMessage('Imprimanta salvată nu este disponibilă acum.');
					setBleDevices(Array.isArray(list) ? list : []);
					if (openPickerOnMissing) setPrinterModalOpen(true);
					return { ok: false, reason: 'device-not-found' };
				}

				const deviceMac = String(getDeviceMac(hit));
				await BLEPrinter.connectPrinter(deviceMac);
				await probeBleConnection();

				const nextName = String(hit?.device_name || hit?.name || name || 'Imprimantă');
				setSavedPrinterMac(deviceMac);
				setSavedPrinterName(nextName);
				await setValueAsync(STORAGE_KEYS.bleMac, deviceMac);
				if (nextName) await setValueAsync(STORAGE_KEYS.bleName, nextName);

				setPrinterConnectionStatus('connected');
				setPrinterConnectionMessage(`Conectat: ${nextName}`);
				return { ok: true, device: hit, mac: deviceMac, name: nextName };
			} catch (e) {
				console.warn('[print-preview] connect saved printer error', e);
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(`Conexiune invalidă: ${String(e?.message || e)}`);
				return { ok: false, reason: 'connect-failed', error: e };
			} finally {
				isConnectingPrinterRef.current = false;
			}
		},
		[probeBleConnection, resetBleConnection],
	);

	useEffect(() => {
		if (Platform.OS !== 'android') return;

		const run = async () => {
			const savedMac = await getValueAsync(STORAGE_KEYS.bleMac);
			const savedName = await getValueAsync(STORAGE_KEYS.bleName);
			setSavedPrinterMac(savedMac || null);
			setSavedPrinterName(savedName ? String(savedName) : '');
			if (savedMac) {
				await connectToSavedPrinter({ openPickerOnMissing: false });
			} else {
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage('Nu există imprimantă salvată.');
			}
		};

		run();
	}, [connectToSavedPrinter]);

	const onPressReconnectPrinter = useCallback(async () => {
		if (isPrinting) return;
		setIsReconnectingPrinter(true);
		const result = await connectToSavedPrinter({ openPickerOnMissing: true });
		if (result?.ok) {
			Alert.alert('Imprimantă', 'Conexiunea cu imprimanta a fost refăcută.');
		}
		setIsReconnectingPrinter(false);
	}, [connectToSavedPrinter, isPrinting]);

	const printerStatusText = useMemo(() => {
		if (printerConnectionStatus === 'connected') {
			return printerConnectionMessage || 'Telefon conectat la imprimantă.';
		}
		if (printerConnectionStatus === 'checking') {
			return printerConnectionMessage || 'Se verifică conexiunea...';
		}
		if (savedPrinterMac) {
			const printerName = savedPrinterName ? ` (${savedPrinterName})` : '';
			return `Telefon neconectat la imprimantă${printerName}.`;
		}
		return printerConnectionMessage || 'Nu există imprimantă salvată.';
	}, [printerConnectionMessage, printerConnectionStatus, savedPrinterMac, savedPrinterName]);

	const onPressPrint = useCallback(() => {
		const run = async () => {
			if (Platform.OS === 'web') {
				Alert.alert('Tipărire', 'Tipărirea prin Bluetooth nu este disponibilă pe Web.');
				return;
			}
			if (Platform.OS === 'ios') {
				Alert.alert(
					'⚠️ Tipărire indisponibilă pe iOS',
					'Imprimanta Datecs DPP-450 folosește Bluetooth Classic (SPP), care nu este permis pentru aplicații terțe pe iOS din cauza restricțiilor Apple (MFi Program).\n\nPoți tipări nota de constatare de pe un dispozitiv Android.',
					[{ text: 'Am înțeles', style: 'cancel' }],
					{ cancelable: true },
				);
				return;
			}
			if (!data?.printed_nota) return;

			if (Platform.OS === 'android') {
				const ok = await ensureAndroidBluetoothPermissions();
				if (!ok) {
					Alert.alert(
						'Permisiuni Bluetooth',
						'Aplicația are nevoie de permisiunea BLUETOOTH_CONNECT (și scan) ca să se conecteze la imprimantă. Te rog acceptă permisiunile și încearcă din nou.',
					);
					return;
				}
			}

			setIsPrinting(true);
			try {
				const COMMANDS = THERMAL_COMMANDS;
				if (!BLEPrinter || !COMMANDS) {
					Alert.alert('Tipărire', 'Modulul de imprimantă nu este disponibil.');
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
							'Imprimanta salvată nu a fost găsită prin BLE scan. Dacă Datecs DPP-450 este Bluetooth clasic (SPP), nu va apărea aici.',
						);
					}
					return;
				}

				// IMPORTANT: use full printer width (maxDots) for print jobs, not the
				// reduced wrapDots used only for preview soft-wrap detection.
				const jobs = buildThermalPrintJobsFromWrappedTemplate({
					wrappedTemplate: printTemplate,
					COMMANDS,
					defaultImageWidth: Math.min(575, maxDots || 575),
				});

				await BLEPrinter.printBill(
					withPrinterCodeTable(COMMANDS.HARDWARE.HW_INIT + COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT, COMMANDS),
					PRINTER_PRINT_OPTS,
				);
				for (const job of jobs) {
					if (job.type === 'text') {
						if (job.value) {
							const v = normalizeTextForEscPos(String(job.value));
							await BLEPrinter.printBill(withPrinterCodeTable(v, COMMANDS), PRINTER_PRINT_OPTS);
						}
						continue;
					}
					if (job.type === 'imageBase64') {
						const base64 = String(job.base64 || '').trim();
						if (!base64) continue;
						if (base64.includes('{{')) {
							// Preview can show placeholders; printing cannot.
							throw new Error('Imagine lipsă (placeholder) în template.');
						}

						// IMPORTANT (Android native module behavior): if we only pass `imageWidth`,
						// the native code keeps the original bitmap height, generating huge data.
						// That often shows as “shifted rows / stripes” on the printer.
						const requestedW = clampInt(Number(job.imageWidth) || 0, 1, 5000);
						const maxW = maxDots ? Math.min(requestedW, maxDots) : requestedW;
						const safeW = clampInt(roundDownToMultiple(maxW, 8) || maxW, 48, maxW || 575);
						const size = await getCachedImageSize(base64);
						// 0=left 1=center 2=right — re-emitted before every 24-dot stripe in Java
						const alignInt = job.align === 'center' ? 1 : job.align === 'right' ? 2 : 0;
						const opts = { imageWidth: safeW, alignment: alignInt };
						if (size?.width && size?.height) {
							opts.imageHeight = Math.max(1, Math.round((safeW * size.height) / size.width));
						} else {
							// Conservative fallback to avoid printing a very tall bitmap.
							opts.imageHeight = Math.max(1, Math.round(safeW * 0.75));
						}
						await BLEPrinter.printImageBase64(base64, opts);
						continue;
					}
				}
				await BLEPrinter.printBill(
					withPrinterCodeTable(
						normalizeTextForEscPos(`\n\n\n${COMMANDS.TEXT_FORMAT.TXT_NORMAL}`),
						COMMANDS,
					),
					PRINTER_PRINT_OPTS,
				);
				Alert.alert(
					'✅ Notă de constatare trimisă',
					'Nota de constatare a fost trimisă către imprimantă.\n\nDacă tipărirea nu s-a realizat corect sau au apărut probleme (hârtie blocată, conexiune întreruptă etc.), poți relua tipărirea apăsând din nou butonul de print.',
					[{ text: 'OK', style: 'default' }],
				);
			} catch (e) {
				console.warn('[print-preview] print error', e);
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(String(e?.message || e));
				Alert.alert(
					'Tipărire',
					`Eroare la tipărire: ${String(e?.message || e)}\n\nDacă imprimanta este Bluetooth clasic (SPP), lista BLE nu o va vedea.`,
				);
			}
			finally {
				setIsPrinting(false);
			}
		};

		run();
	}, [connectToSavedPrinter, data?.printed_nota, maxDots, printTemplate]);

	const onRefreshBleDevices = useCallback(async () => {
		setBleError(null);
		setBleLoading(true);
		try {
			if (Platform.OS === 'android') {
				const ok = await ensureAndroidBluetoothPermissions();
				if (!ok) throw new Error('BLUETOOTH_CONNECT / SCAN not granted');
			}
			await BLEPrinter.init();
			const list = await BLEPrinter.getDeviceList();
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
				Alert.alert('Imprimantă', 'Dispozitiv invalid (lipsește adresa).');
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
				setSavedPrinterName(String(name || 'Imprimantă'));
				const COMMANDS = THERMAL_COMMANDS;
				await BLEPrinter.init();
				await BLEPrinter.connectPrinter(String(mac));
				setPrinterConnectionStatus('connected');
				setPrinterConnectionMessage(`Conectat: ${String(name || 'Imprimantă')}`);

				const jobs = buildThermalPrintJobsFromWrappedTemplate({
					wrappedTemplate: printTemplate,
					COMMANDS,
					defaultImageWidth: Math.min(575, maxDots || 575),
				});
				await BLEPrinter.printBill(
					withPrinterCodeTable(COMMANDS.HARDWARE.HW_INIT + COMMANDS.TEXT_FORMAT.TXT_ALIGN_LT, COMMANDS),
					PRINTER_PRINT_OPTS,
				);
				for (const job of jobs) {
					if (job.type === 'text') {
						if (job.value) {
							const v = normalizeTextForEscPos(String(job.value));
							await BLEPrinter.printBill(withPrinterCodeTable(v, COMMANDS), PRINTER_PRINT_OPTS);
						}
					} else if (job.type === 'imageBase64') {
						const base64 = String(job.base64 || '').trim();
						if (!base64) continue;
						if (base64.includes('{{')) throw new Error('Imagine lipsă (placeholder) în template.');
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
						await BLEPrinter.printImageBase64(base64, opts);
					}
				}
				await BLEPrinter.printBill(
					withPrinterCodeTable(
						normalizeTextForEscPos(`\n\n\n${COMMANDS.TEXT_FORMAT.TXT_NORMAL}`),
						COMMANDS,
					),
					PRINTER_PRINT_OPTS,
				);
				Alert.alert(
					'✅ Notă de constatare trimisă',
					'Nota de constatare a fost trimisă către imprimantă.\n\nDacă tipărirea nu s-a realizat corect sau au apărut probleme (hârtie blocată, conexiune întreruptă etc.), poți relua tipărirea apăsând din nou butonul de print.',
					[{ text: 'OK', style: 'default' }],
				);
			} catch (e) {
				console.warn('[print-preview] pick+print error', e);
				setPrinterConnectionStatus('disconnected');
				setPrinterConnectionMessage(String(e?.message || e));
				Alert.alert('Tipărire', `Eroare: ${String(e?.message || e)}`);
			} finally {
				setIsPrinting(false);
			}
		},
		[maxDots, printTemplate],
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
			<Modal
				transparent
				visible={printerModalOpen}
				animationType="slide"
				onRequestClose={() => setPrinterModalOpen(false)}
			>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<View style={styles.modalHeader}>
							<CustomTextBold style={styles.modalTitle}>Selectează imprimanta (BLE)</CustomTextBold>
							<Pressable onPress={() => setPrinterModalOpen(false)} hitSlop={10}>
								<Text style={styles.modalClose}>✕</Text>
							</Pressable>
						</View>

						<Text style={styles.modalHint}>
							Dacă imprimanta ta e Bluetooth clasic (SPP) (ex: multe Datecs DPP), nu va apărea aici.
						</Text>
						{bleError ? <Text style={styles.modalError}>{bleError}</Text> : null}

						<View style={styles.modalActions}>
							<Pressable
								onPress={onRefreshBleDevices}
								style={({ pressed }) => [styles.modalButton, pressed && styles.modalButtonPressed]}
								disabled={bleLoading}
							>
								<Text style={styles.modalButtonText}>{bleLoading ? 'Se caută...' : 'Reîncarcă lista'}</Text>
							</Pressable>
							<Pressable
								onPress={async () => {
									await removeValueAsync(STORAGE_KEYS.bleMac);
									await removeValueAsync(STORAGE_KEYS.bleName);
									Alert.alert('Imprimantă', 'Imprimanta salvată a fost ștearsă.');
								}}
								style={({ pressed }) => [styles.modalButtonSecondary, pressed && styles.modalButtonPressed]}
							>
								<Text style={styles.modalButtonSecondaryText}>Șterge imprimanta salvată</Text>
							</Pressable>
						</View>

						<FlatList
							data={bleDevices}
							keyExtractor={(item, idx) =>
								String(item?.inner_mac_address || item?.macAddress || item?.mac || item?.address || idx)
							}
							renderItem={({ item }) => {
								const name = item?.device_name || item?.name || 'Printer';
								const mac = item?.inner_mac_address || item?.macAddress || item?.mac || item?.address;
								return (
									<Pressable
										onPress={() => onPickBleDevice(item)}
										style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
										disabled={isPrinting}
									>
										<Text style={styles.deviceName}>{String(name)}</Text>
										<Text style={styles.deviceMac}>{String(mac || '')}</Text>
									</Pressable>
								);
							}}
							ListEmptyComponent={
								bleLoading ? null : <Text style={styles.modalEmpty}>Nu au fost găsite imprimante BLE.</Text>
							}
							contentContainerStyle={{ paddingBottom: 10 }}
						/>
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
						{`Preview 1:1 by dots  ·  wrap dots: ${maxDots}`}
					</Text>
					<Text style={styles.metaText} allowFontScaling={false}>
						{`dots: ${maxDots}  ·  content: ${Math.round(contentWidthPx)}px  ·  ${pxPerDot ? pxPerDot.toFixed(3) : '0.000'} px/dot`}
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
							<CustomTextBold style={styles.reconnectButtonText}>Reconectează</CustomTextBold>
						)}
					</Pressable>
				<Pressable
					onPress={onPressPrint}
					disabled={isPrinting}
					style={({ pressed }) => [
						styles.printButton,
						pressed && styles.printButtonPressed,
						isPrinting && styles.printButtonDisabled,
					]}
					hitSlop={8}
				>
					{isPrinting ? (
						<ActivityIndicator size="small" color={white} />
					) : (
						<CustomTextBold style={styles.printButtonText}>
							{strings?.print || 'Tipărește'}
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
		backgroundColor: white,
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
		backgroundColor: '#E9ECF1',
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
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 14,
		backgroundColor: 'rgba(233,236,241,0.96)',
		borderTopWidth: 1,
		borderTopColor: '#E1E4EA',
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
		height: 48,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: white,
		borderWidth: 1,
		borderColor: purple,
	},
	reconnectButtonText: {
		color: purple,
		fontSize: 15,
	},
	printButton: {
		flex: 1,
		height: 48,
		borderRadius: 12,
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
		fontSize: 16,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.35)',
		justifyContent: 'flex-end',
	},
	modalCard: {
		backgroundColor: '#fff',
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		paddingHorizontal: 14,
		paddingTop: 14,
		maxHeight: '80%',
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 6,
	},
	modalTitle: {
		fontSize: 16,
		color: '#111',
	},
	modalClose: {
		fontSize: 18,
		color: '#111',
		paddingHorizontal: 6,
		paddingVertical: 4,
	},
	modalHint: {
		fontSize: 12,
		color: '#667085',
		marginBottom: 10,
	},
	modalError: {
		fontSize: 12,
		color: '#B42318',
		marginBottom: 10,
	},
	modalActions: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 10,
	},
	modalButton: {
		flex: 1,
		height: 40,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: purple,
	},
	modalButtonSecondary: {
		flex: 1,
		height: 40,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#EEF2F6',
	},
	modalButtonPressed: {
		opacity: 0.9,
	},
	modalButtonText: {
		color: white,
		fontSize: 13,
		fontWeight: '700',
	},
	modalButtonSecondaryText: {
		color: '#344054',
		fontSize: 13,
		fontWeight: '700',
	},
	deviceRow: {
		paddingVertical: 10,
		borderTopWidth: 1,
		borderTopColor: '#EEF2F6',
	},
	deviceRowPressed: {
		backgroundColor: '#F8FAFC',
	},
	deviceName: {
		fontSize: 14,
		color: '#111',
		fontWeight: '700',
	},
	deviceMac: {
		fontSize: 12,
		color: '#667085',
		marginTop: 2,
	},
	modalEmpty: {
		paddingVertical: 16,
		textAlign: 'center',
		color: '#667085',
		fontSize: 13,
	},
	meta: {
		width: '100%',
		maxWidth: 520,
		paddingHorizontal: 12,
		marginBottom: 8,
	},
	metaText: {
		fontFamily: monoFontRegular,
		fontSize: 12,
		color: '#667085',
	},
	paper: {
		backgroundColor: '#FEFEFE',
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 10,
		borderWidth: 1,
		borderColor: '#E1E4EA',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.12,
		shadowRadius: 10,
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
