// app/(app)/print-preview/index.js
// ─────────────────────────────────────────────────────────────────────────────
// REWRITTEN: print preview now uses the new BTClassicPrinter native module via
// `util/printer/btPrinter`. Key behaviour changes:
//   • Auto-connect on mount if a printer is saved.
//   • Live connection indicator (heartbeat + native disconnect events).
//   • Print button is DISABLED unless `status === 'connected'`.
//   • User can pick any paired BT printer from a modal — works for Datecs DPP-450
//     (Classic SPP) which the old BLE-only module could never see.
//   • All bytes are sent via our own `writeBase64` so a mid-print disconnect throws
//     a clean JS error instead of crashing native.
// ─────────────────────────────────────────────────────────────────────────────

import {
	View, ScrollView, Image, ActivityIndicator, Dimensions, Text, Pressable,
	Modal, FlatList, Platform, Alert, StyleSheet,
} from 'react-native';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';

import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resize, general } from '../../../util/style';
import { purple, white, black, orange, green, red, lightOrange, gray } from '../../../util/colors';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useMessage } from '../../../util/messages';

import { getPrintPreview } from '../../../util/printPreviewStore';
import { wordWrapByDots } from '../../../util/printer/wordWrapByDots';

import btPrinter, { useBtPrinter } from '../../../util/printer/btPrinter';
import {
	encodeTextCp852, startupBytes, ALIGN, BOLD, UNDERLINE, SIZE, FONT, RESET_STYLE, LF,
	toBase64, concatBytes, uint8ToBase64,
} from '../../../util/printer/escposEncoding';

const DEFAULT_DOTS = 832;
const DOTS_PER_CHAR_A = 12;
const DOTS_PER_CHAR_B = 9;
const DOTS_HEIGHT_A = 24;
const DOTS_HEIGHT_B = 17;

const monoFontRegular = 'RobotoMono_400Regular';
const monoFontBold = 'RobotoMono_700Bold';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.trunc(n)));

// ─── Receipt template parsing (UNCHANGED from previous version) ──────────────
// We keep the same markup → blocks parser so the on-screen preview is identical.

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
		Image.getSize(uri, (w, h) => (w > 0 && h > 0 ? resolve({ width: w, height: h }) : resolve(null)), () => resolve(null));
	});
};

const isTag = (t) => typeof t === 'string' && t.startsWith('<') && t.endsWith('>');
const isNewline = (t) => t === '\n' || t === '\r\n';

const tokenizeReceipt = (tpl) => {
	const parts = String(tpl).split(/(<img[^>]*>|<\/img>|<[^>]+>|\r?\n)/g);
	return parts.filter((p) => p !== undefined && p !== null && p !== '');
};

const defaultState = () => ({
	align: 'left', bold: false, underline: false,
	font: 'a', width2x: false, height2x: false,
});

const stateToTextStyleKey = (st) =>
	`${st.font}|${st.width2x ? 'w2x' : 'w1x'}|${st.height2x ? 'h2x' : 'h1x'}|${st.bold ? 'b' : 'n'}|${st.underline ? 'u' : 'n'}`;

const parseReceiptMarkup = (wrappedTemplate) => {
	const tokens = tokenizeReceipt(wrappedTemplate);
	const blocks = [];
	let st = defaultState();
	let currentLineRuns = [];

	const pushLine = () => {
		if (currentLineRuns.length === 0) { blocks.push({ type: 'blank' }); return; }
		blocks.push({ type: 'text', align: st.align, runs: currentLineRuns });
		currentLineRuns = [];
	};

	const pushText = (txt) => {
		if (!txt) return;
		const key = stateToTextStyleKey(st);
		const last = currentLineRuns[currentLineRuns.length - 1];
		if (last && last.key === key) { last.text += txt; return; }
		currentLineRuns.push({ key, text: txt, style: { ...st } });
	};

	let inImg = false, imgTag = null, imgContent = '';

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (inImg) {
			if (String(token).toLowerCase() === '</img>') {
				if (currentLineRuns.length > 0) pushLine();
				blocks.push({
					type: 'img', align: st.align,
					widthDots: parseImgWidthDots(imgTag),
					content: String(imgContent).trim(),
				});
				blocks.push({ type: 'blank' });
				inImg = false; imgTag = null; imgContent = '';
				continue;
			}
			imgContent += token; continue;
		}
		if (isNewline(token)) { pushLine(); continue; }
		if (isTag(token)) {
			const t = String(token).toLowerCase();
			if (t.startsWith('<img')) { inImg = true; imgTag = token; imgContent = ''; continue; }
			if (t === '<l>' || t === '<c>' || t === '<r>') {
				const nextAlign = t === '<l>' ? 'left' : t === '<c>' ? 'center' : 'right';
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
			else if (t === '<h2x>') st.height2x = true;
			else if (t === '<w2x>') st.width2x = true;
			else if (t === '<big>') { st.width2x = true; st.height2x = true; }
			else if (t === '<norm>') { st.bold = false; st.underline = false; st.font = 'a'; st.width2x = false; st.height2x = false; }
			continue;
		}
		pushText(token);
	}
	if (currentLineRuns.length > 0) blocks.push({ type: 'text', align: st.align, runs: currentLineRuns });
	return blocks;
};

// ─── On-screen preview helpers (UNCHANGED) ───────────────────────────────────

const getCharDotsForStyle = (rs) => (rs?.font === 'b' ? DOTS_PER_CHAR_B : DOTS_PER_CHAR_A);
const getRunDotsHeight = (rs) => {
	const base = rs?.font === 'b' ? DOTS_HEIGHT_B : DOTS_HEIGHT_A;
	return base * (rs?.height2x ? 2 : 1);
};
const alignToAlignSelf = (a) => (a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start');

const buildTextLineLayout = ({ runs, align, maxDots }) => {
	const cleanRuns = Array.isArray(runs) ? runs.filter((r) => r && typeof r.text === 'string' && r.style) : [];
	if (cleanRuns.length === 0) return null;
	const lineHeightDots = cleanRuns.reduce((mx, r) => Math.max(mx, getRunDotsHeight(r.style)), DOTS_HEIGHT_A);
	return { runs: cleanRuns, align, lineHeightDots };
};

const resolveRunStyle = ({ runStyle, pxPerDot, lineHeightPx }) => {
	const baseHeightDots = runStyle?.font === 'b' ? DOTS_HEIGHT_B : DOTS_HEIGHT_A;
	const fontSize = Math.max(4, Math.floor(baseHeightDots * pxPerDot * 0.9));
	const widthScale = runStyle?.width2x ? 2 : 1;
	const heightScale = runStyle?.height2x ? 2 : 1;
	return {
		fontFamily: runStyle?.bold ? monoFontBold : monoFontRegular,
		fontSize, lineHeight: lineHeightPx,
		textAlignVertical: 'center', color: '#111',
		textDecorationLine: runStyle?.underline ? 'underline' : 'none',
		includeFontPadding: false,
		...(widthScale !== 1 || heightScale !== 1
			? { transform: [{ scaleX: widthScale }, { scaleY: heightScale }] }
			: null),
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
		Image.getSize(uri,
			(w, h) => { if (!cancelled && w > 0 && h > 0) setRatio(w / h); },
			() => { if (!cancelled) setRatio(null); });
		return () => { cancelled = true; };
	}, [uri]);
	const heightPx = ratio ? desiredWidthPx / ratio : Math.round(desiredWidthPx * 0.35);
	return <Image source={{ uri }} style={{ width: desiredWidthPx, height: heightPx, alignSelf: alignToAlignSelf(align) }} resizeMode="contain" />;
};

// ─── ESC/POS render pass — turns parsed blocks into a base64 byte stream ─────
//
// We send the receipt as ONE chunked stream of base64 packets:
//   • text packets are batched per ~256 bytes to keep BT writes small (safer for
//     mid-stream disconnects to surface fast).
//   • image packets go via the native printImageBase64 (rasterized in Java).
//
// If ANY write throws (printer disappears), we propagate up to onPressPrint
// which shows a clean disconnect message — no more crash.

// Build a byte stream from a list of text blocks.
//
// Design notes:
//   • We emit ESC a (alignment) UNCONDITIONALLY at the start of every line.
//     This adds 3 bytes/line but eliminates an entire class of bugs where
//     the printer's internal alignment state drifts out of sync with our JS
//     state machine (e.g. after a printImageBase64 call which resets ALIGN
//     internally on the Java side).
//   • Same for size/bold/underline/font — we emit them per-run, no delta
//     tracking. The bytes are tiny; correctness > optimization here.
const buildTextStream = (blocks) => {
	const chunks = [];
	const pushBuf = (b) => chunks.push(b);

	const alignByteFor = (align) => align === 'center' ? 1 : align === 'right' ? 2 : 0;

	for (const b of blocks) {
		if (b.type === 'blank') { pushBuf(LF); continue; }
		if (b.type === 'text') {
			// Always emit ALIGN at the start of EVERY line, no delta tracking.
			pushBuf(ALIGN(alignByteFor(b.align)));
			for (const run of b.runs || []) {
				// Always emit full per-run style. Cheap and correct.
				pushBuf(BOLD(!!run.style?.bold));
				pushBuf(UNDERLINE(!!run.style?.underline));
				pushBuf(FONT(run.style?.font === 'b'));
				pushBuf(SIZE(!!run.style?.width2x, !!run.style?.height2x));
				pushBuf(encodeTextCp852(run.text));
			}
			pushBuf(LF);
			continue;
		}
		// 'img' is handled outside (needs separate native call) — caller handles it.
	}
	// Reset style at the end so subsequent text inherits defaults.
	pushBuf(RESET_STYLE);
	return chunks;
};

const sendBlocksToPrinter = async ({ blocks, maxDots, getCachedImageSize, msg }) => {
	// 1. Startup: reset printer + select CP852.
	await btPrinter.writeBase64(toBase64(startupBytes()));

	// 2. Walk blocks in order; when we hit an image, flush the text buffer first.
	let textBufBlocks = [];
	const flushText = async () => {
		if (textBufBlocks.length === 0) return;
		const stream = buildTextStream(textBufBlocks);
		// Concat into a single Uint8Array, then chunk into ~512-byte packets.
		const fullBuf = concatBytes(stream);
		const CHUNK = 512;
		for (let i = 0; i < fullBuf.length; i += CHUNK) {
			const end = Math.min(i + CHUNK, fullBuf.length);
			// Copy the slice into a fresh Uint8Array — avoids any prototype/byteOffset issues
			// from .subarray() on RN's polyfilled Buffer/Uint8Array.
			const piece = new Uint8Array(end - i);
			for (let j = i, k = 0; j < end; j++, k++) piece[k] = fullBuf[j];
			await btPrinter.writeBase64(uint8ToBase64(piece));
		}
		textBufBlocks = [];
	};

	for (const b of blocks) {
		if (b?.type === 'img') {
			await flushText();
			const base64 = String(b.content || '').trim();
			if (!base64 || base64.includes('{{')) {
				throw new Error(msg('missingImagePlaceholder', 'Missing image (placeholder) in template.'));
			}
			const requestedW = clampInt(Number(b.widthDots) || 0, 1, 5000);
			// Clamp to a SAFE width for the DPP-450 internal buffer. The printer
			// physical max is 832 dots, but anything above ~576 dots starts to
			// risk buffer overruns / partial prints depending on image height.
			const maxW = maxDots ? Math.min(requestedW || maxDots, maxDots) : (requestedW || maxDots);
			const safeW = clampInt(roundDownToMultiple(maxW, 8) || maxW, 48, Math.min(maxW || 576, 576));
			const alignInt = b.align === 'center' ? 1 : b.align === 'right' ? 2 : 0;
			await btPrinter.printImageBase64(base64, safeW, alignInt);
			// The native side resets ALIGN to 0 after the image, so the next
			// text line that we flush will re-emit its own ALIGN unconditionally
			// (see buildTextStream above) — no manual reset needed here.
			await btPrinter.writeBase64(toBase64(LF));
			continue;
		}
		textBufBlocks.push(b);
	}
	await flushText();

	// 3. Feed paper + reset style.
	await btPrinter.writeBase64(toBase64(concatBytes([LF, LF, LF, RESET_STYLE])));
};

// ─────────────────────────────────────────────────────────────────────────────
// Screen component
// ─────────────────────────────────────────────────────────────────────────────

const PrintPreviewScreen = () => {
	const { PrintPreviewScreen: strings } = useMessage();
	const decodeEscapedNewlines = useCallback((v) => String(v ?? '').replace(/\\n/g, '\n'), []);
	const msg = useCallback((key, fb) => decodeEscapedNewlines(strings?.[key] || fb), [decodeEscapedNewlines, strings]);
	const msgWith = useCallback((key, fb, vars = {}) => {
		const t = strings?.[key] || fb;
		const rendered = Object.entries(vars).reduce(
			(acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? '')),
			String(t),
		);
		return decodeEscapedNewlines(rendered);
	}, [decodeEscapedNewlines, strings]);

	const [data, setData] = useState(null);
	const [isPrinting, setIsPrinting] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const [printerModalOpen, setPrinterModalOpen] = useState(false);
	const [pairedDevices, setPairedDevices] = useState([]);
	const [listLoading, setListLoading] = useState(false);
	const [listError, setListError] = useState(null);

	// Subscribe to the printer singleton — UI re-renders on every status change.
	const printer = useBtPrinter();

	useEffect(() => { setData(getPrintPreview()); }, []);

	// Auto-connect on mount.
	const autoConnectedRef = useRef(false);
	useEffect(() => {
		if (autoConnectedRef.current) return;
		if (Platform.OS !== 'android') return;
		if (!printer.isAvailable) return;
		autoConnectedRef.current = true;
		(async () => {
			const saved = await btPrinter.loadSavedPrinter();
			if (saved.mac) {
				await btPrinter.connect();
			}
		})();
	}, [printer.isAvailable]);

	// ─── Preview geometry (unchanged) ──────────────────────────────────────────
	const maxDots = data?.dots_printer ? Number(data.dots_printer) : DEFAULT_DOTS;
	const screenWidth = Dimensions.get('window').width;
	const maxPaperWidthPx = clamp(screenWidth - 24, 260, 520);
	const paperWidthScale = maxDots > 0 ? maxDots / DEFAULT_DOTS : 1;
	const paperWidthPx = clamp(maxPaperWidthPx * paperWidthScale, 220, maxPaperWidthPx);
	const paperPaddingX = 10;
	const contentWidthPx = clamp(paperWidthPx - paperPaddingX * 2, 200, paperWidthPx);
	const pxPerDot = useMemo(() => (maxDots > 0 ? contentWidthPx / maxDots : 0), [contentWidthPx, maxDots]);

	const wrappedTemplate = useMemo(() => {
		if (!data?.printed_nota) return '';
		return wordWrapByDots(String(data.printed_nota), maxDots);
	}, [data?.printed_nota, maxDots]);

	const blocks = useMemo(() => (wrappedTemplate ? parseReceiptMarkup(wrappedTemplate) : []), [wrappedTemplate]);

	// ─── Print handler ─────────────────────────────────────────────────────────
	const onPressPrint = useCallback(() => {
		const run = async () => {
			if (Platform.OS === 'web') {
				Alert.alert(msg('printTitle', 'Print'), msg('printBluetoothUnavailableWeb', 'Bluetooth printing is not available on Web.'));
				return;
			}
			if (Platform.OS === 'ios') {
				Alert.alert(
					msg('printUnavailableIOS', '⚠️ Printing unavailable on iOS'),
					msg('printUnavailableIOSBody', 'Datecs DPP-450 uses Bluetooth Classic (SPP), which is not allowed for third-party apps on iOS.\n\nYou can print from an Android device.'),
					[{ text: msg('understood', 'Understood'), style: 'cancel' }],
					{ cancelable: true },
				);
				return;
			}
			if (!data?.printed_nota) return;
			if (printer.status !== 'connected') {
				Alert.alert(
					msg('printTitle', 'Print'),
					msg('printerNotConnectedMsg', 'Printer is not connected. Please connect it first.'),
				);
				return;
			}

			setIsPrinting(true);
			btPrinter.beginPrint();
			let printOk = false;
			try {
				const imageSizeCache = new Map();
				const getCachedImageSize = async (base64) => {
					const key = String(base64 || '');
					if (imageSizeCache.has(key)) return imageSizeCache.get(key);
					const size = await getImageSizeFromBase64(key);
					imageSizeCache.set(key, size);
					return size;
				};

				await sendBlocksToPrinter({ blocks, maxDots, getCachedImageSize, msg });
				printOk = true;

				Alert.alert(
					msg('printSentTitle', '✅ Inspection note sent'),
					msg('printSentMessage', 'The inspection note was sent to the printer.'),
					[{ text: msg('ok', 'OK'), style: 'default' }],
				);
			} catch (e) {
				console.warn('[print-preview] print error', e);
				const errMsg = String(e?.message || e);
				Alert.alert(
					msg('printTitle', 'Print'),
					msgWith('printErrorMessage', 'Print error: {{error}}', { error: errMsg }),
					[{ text: msg('ok', 'OK'), style: 'default' }],
					{ cancelable: true },
				);
			} finally {
				btPrinter.endPrint(printOk);
				setIsPrinting(false);
			}
		};
		run().catch((e) => {
			console.warn('[print-preview] unhandled print error', e);
			setIsPrinting(false);
			btPrinter.endPrint(false);
		});
	}, [blocks, data?.printed_nota, maxDots, msg, msgWith, printer.status]);

	// ─── Reconnect handler ─────────────────────────────────────────────────────
	const onPressReconnect = useCallback(async () => {
		if (isPrinting) return;
		setIsReconnecting(true);
		try {
			if (!printer.mac) {
				// No saved printer → open picker.
				setPrinterModalOpen(true);
				return;
			}
			const res = await btPrinter.connect();
			if (res.ok) {
				Alert.alert(
					msg('printerReconnectedTitle', 'Printer'),
					msg('printerReconnectedMessage', 'Printer connection has been restored.'),
				);
			} else {
				Alert.alert(
					msg('printTitle', 'Print'),
					msg('printerOffOrOutOfRange', '⚠️ Could not reach the printer. Make sure it is turned on and in range.'),
				);
			}
		} finally {
			setIsReconnecting(false);
		}
	}, [isPrinting, msg, printer.mac]);

	// ─── Open printer modal: list paired devices ───────────────────────────────
	const refreshPairedDevices = useCallback(async () => {
		setListError(null);
		setListLoading(true);
		try {
			const list = await btPrinter.listPairedDevices();
			setPairedDevices(list);
		} catch (e) {
			setPairedDevices([]);
			setListError(String(e?.message || e));
		} finally {
			setListLoading(false);
		}
	}, []);

	useEffect(() => {
		if (printerModalOpen) refreshPairedDevices();
	}, [printerModalOpen, refreshPairedDevices]);

	const onPickDevice = useCallback(async (device) => {
		const mac = device?.mac;
		const name = device?.name || msg('printerDefaultName', 'Printer');
		if (!mac) {
			Alert.alert(msg('printerReconnectedTitle', 'Printer'), msg('invalidDeviceMissingAddress', 'Invalid device (missing address).'));
			return;
		}
		setPrinterModalOpen(false);
		await btPrinter.setSavedPrinter(mac, name);
		const res = await btPrinter.connect(mac);
		if (!res.ok) {
			Alert.alert(
				msg('printTitle', 'Print'),
				msg('printerOffOrOutOfRange', '⚠️ Could not reach the printer. Make sure it is turned on and in range.'),
			);
		}
	}, [msg]);

	const onForgetSavedPrinter = useCallback(async () => {
		await btPrinter.forgetSavedPrinter();
		Alert.alert(msg('printerReconnectedTitle', 'Printer'), msg('savedPrinterDeleted', 'Saved printer was removed.'));
	}, [msg]);

	// ─── Status pill text + colour ─────────────────────────────────────────────
	const statusText = useMemo(() => {
		switch (printer.status) {
			case 'connected':
				return msgWith('phoneConnectedToPrinter', 'Connected to {{name}}', {
					name: printer.name || msg('printerDefaultName', 'Printer'),
				});
			case 'connecting': return msg('checkingPrinterConnection', 'Connecting to printer…');
			case 'printing': return msg('printingNow', 'Printing…');
			case 'disconnected':
				if (printer.mac) {
					const suffix = printer.name ? ` (${printer.name})` : '';
					return msgWith('phoneDisconnectedToPrinter', 'Printer disconnected{{nameSuffix}}.', { nameSuffix: suffix });
				}
				return msg('noSavedPrinter', 'No saved printer.');
			case 'unavailable': return msg('bleAndroidOnly', 'Printing available on Android only.');
			default: return msg('noSavedPrinter', 'No saved printer.');
		}
	}, [msg, msgWith, printer]);

	const statusDotStyle =
		printer.status === 'connected' ? styles.connectionDotConnected :
		printer.status === 'connecting' || printer.status === 'printing' ? styles.connectionDotChecking :
		styles.connectionDotDisconnected;

	if (!data) {
		return (
			<View style={s.center}>
				<ActivityIndicator size="large" color={purple} />
				<CustomTextMedium style={s.centerText}>{strings?.loading || 'Loading preview...'}</CustomTextMedium>
			</View>
		);
	}
	if (!data?.printed_nota) {
		return (
			<View style={s.center}>
				<Text style={styles.errIcon}>!</Text>
				<CustomTextMedium style={s.centerText}>{strings?.missingTemplate || 'Missing template from server.'}</CustomTextMedium>
			</View>
		);
	}

	const canPrint = printer.status === 'connected' && !isPrinting;

	return (
		<View style={styles.screen}>
			<Stack.Screen options={{
				title: strings?.title || 'Print Preview',
				headerStyle: { backgroundColor: lightOrange },
				headerTintColor: purple,
				statusBarColor: lightOrange,
				statusBarStyle: 'dark',
				headerRight: () => (
					<Pressable onPress={() => setPrinterModalOpen(true)} hitSlop={10} style={{ marginRight: 12, padding: 4 }}>
						<Ionicons name="print-outline" size={24} color={purple} />
					</Pressable>
				),
			}} />

			{/* ── Printer selection modal ───────────────────────────────────── */}
			<Modal transparent visible={printerModalOpen} animationType="slide" onRequestClose={() => setPrinterModalOpen(false)}>
				<View style={styles.modalBackdrop}>
					<Pressable style={StyleSheet.absoluteFill} onPress={() => setPrinterModalOpen(false)} />
					<View style={styles.modalCard}>
						<View style={styles.modalHeader}>
							<View style={styles.modalHeaderIconWrap}>
								<Ionicons name="bluetooth" size={resize(15)} color={white} />
							</View>
							<CustomTextBold style={styles.modalTitle}>{msg('selectPrinterBle', 'Select Bluetooth Printer')}</CustomTextBold>
							<Pressable onPress={() => setPrinterModalOpen(false)} hitSlop={10} style={styles.modalCloseBtn}>
								<Ionicons name="close" size={resize(15)} color={white} />
							</Pressable>
						</View>

						<Text style={styles.modalHint}>
							{msg('pairFirstHint', 'Pair the printer first in Android Settings → Bluetooth, then refresh this list.')}
						</Text>

						{printer.mac ? (
							<View style={styles.savedPrinterSection}>
								<CustomTextMedium style={styles.sectionLabel}>{msg('savedPrinterLabel', 'Saved printer')}</CustomTextMedium>
								<View style={styles.savedPrinterCard}>
									<View style={styles.savedPrinterIconWrap}>
										<Ionicons name="print" size={resize(18)} color={purple} />
									</View>
									<View style={styles.savedPrinterInfo}>
										<CustomTextBold style={styles.savedPrinterName}>{printer.name || msg('printerDefaultName', 'Printer')}</CustomTextBold>
										<Text style={styles.savedPrinterMacText}>{printer.mac}</Text>
									</View>
									<Pressable onPress={onForgetSavedPrinter} hitSlop={10}
										style={({ pressed }) => [styles.forgetBtn, pressed && { opacity: 0.6 }]}>
										<Ionicons name="trash-outline" size={resize(17)} color={red} />
									</Pressable>
								</View>
							</View>
						) : null}

						{listError ? <Text style={styles.modalError}>{listError}</Text> : null}

						<View style={styles.devicesSection}>
							<View style={styles.devicesSectionHeader}>
								<CustomTextMedium style={styles.sectionLabel}>{msg('availableDevices', 'Paired devices')}</CustomTextMedium>
								<Pressable onPress={refreshPairedDevices} disabled={listLoading}
									style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}>
									{listLoading
										? <ActivityIndicator size={resize(13)} color={purple} style={{ marginRight: resize(4) }} />
										: <Ionicons name="refresh-outline" size={resize(14)} color={purple} style={{ marginRight: resize(4) }} />}
									<Text style={styles.scanBtnText}>{listLoading ? msg('searching', 'Loading…') : msg('reloadList', 'Refresh')}</Text>
								</Pressable>
							</View>

							<FlatList
								data={pairedDevices}
								keyExtractor={(it, idx) => String(it?.mac || idx)}
								renderItem={({ item }) => {
									const isSaved = printer.mac && String(item.mac).toLowerCase() === String(printer.mac).toLowerCase();
									return (
										<Pressable onPress={() => onPickDevice(item)} disabled={isPrinting}
											style={({ pressed }) => [styles.deviceRow, isSaved && styles.deviceRowSaved, pressed && styles.deviceRowPressed]}>
											<View style={[styles.deviceIconWrap, isSaved && styles.deviceIconWrapSaved]}>
												<Ionicons name={item.isLikelyPrinter ? 'print' : 'bluetooth'} size={resize(15)} color={isSaved ? white : purple} />
											</View>
											<View style={styles.deviceInfo}>
												<CustomTextBold style={[styles.deviceName, isSaved && styles.deviceNameSaved]}>{item.name || msg('printerDefaultName', 'Printer')}</CustomTextBold>
												<Text style={[styles.deviceMac, isSaved && styles.deviceMacSaved]}>{item.mac}</Text>
											</View>
											{isSaved
												? <View style={styles.deviceCheck}><Ionicons name="checkmark-circle" size={resize(18)} color={purple} /></View>
												: <Ionicons name="chevron-forward" size={resize(15)} color={gray} />}
										</Pressable>
									);
								}}
								ListEmptyComponent={
									listLoading
										? <View style={styles.scanningState}>
												<ActivityIndicator size="large" color={purple} />
												<Text style={styles.scanningText}>{msg('searchingForDevices', 'Loading devices…')}</Text>
											</View>
										: <View style={styles.emptyState}>
												<Ionicons name="bluetooth-outline" size={resize(36)} color={gray} />
												<Text style={styles.modalEmpty}>{msg('noPairedDevices', 'No paired Bluetooth devices found.')}</Text>
												<Text style={styles.modalEmptyHint}>{msg('pairInSettingsHint', 'Pair your printer in Android Settings first.')}</Text>
											</View>
								}
								contentContainerStyle={{ paddingBottom: resize(24) }}
							/>
						</View>
					</View>
				</View>
			</Modal>

			{/* ── Receipt preview (UNCHANGED rendering) ─────────────────────── */}
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				<View style={styles.meta}>
					<Text style={styles.metaText} allowFontScaling={false}>
						{`${msg('previewByDots', 'Preview 1:1 by dots')}  ·  ${msg('wrapDots', 'wrap dots')}: ${maxDots}`}
					</Text>
				</View>

				<View style={[styles.paper, { width: paperWidthPx }]}>
					{blocks.map((b, idx) => {
						if (!b || b.type === 'blank') {
							const h = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: h }} />;
						}
						if (b.type === 'img') {
							const widthDots = b.widthDots || maxDots;
							const desiredWidthPx = clamp((contentWidthPx * widthDots) / maxDots, 24, contentWidthPx);
							return (
								<View key={`img-${idx}`} style={styles.block}>
									<ReceiptImage base64OrPlaceholder={b.content} desiredWidthPx={desiredWidthPx} align={b.align} />
								</View>
							);
						}
						const runs = Array.isArray(b?.runs) ? b.runs.filter((r) => r && typeof r.text === 'string' && r.style) : [];
						if (b.type !== 'text' || runs.length === 0) {
							const h = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: h }} />;
						}
						const lineLayout = buildTextLineLayout({ runs, align: b.align, maxDots });
						if (!lineLayout) {
							const h = Math.max(6, Math.round(DOTS_HEIGHT_A * pxPerDot));
							return <View key={`blank-${idx}`} style={{ height: h }} />;
						}
						const lineHeightPx = Math.max(6, Math.round(lineLayout.lineHeightDots * pxPerDot));
						const textAlign = lineLayout.align === 'center' ? 'center' : lineLayout.align === 'right' ? 'right' : 'left';
						return (
							<View key={`txt-${idx}`} style={{ minHeight: lineHeightPx, width: contentWidthPx }}>
								<Text allowFontScaling={false} numberOfLines={1} ellipsizeMode="clip"
									style={[styles.lineText, { left: 0, width: contentWidthPx, lineHeight: lineHeightPx, textAlign }]}>
									{lineLayout.runs.map((run, j) => (
										<Text key={`${idx}-${j}`} allowFontScaling={false}
											style={resolveRunStyle({ runStyle: run.style, pxPerDot, lineHeightPx })}>
											{run.text}
										</Text>
									))}
								</Text>
							</View>
						);
					})}
				</View>
			</ScrollView>

			{/* ── Bottom bar: connection status + buttons ───────────────────── */}
			<View style={styles.bottomBar}>
				<View style={styles.connectionRow}>
					<View style={[styles.connectionDot, statusDotStyle]} />
					<CustomTextMedium style={styles.connectionText}>{statusText}</CustomTextMedium>
				</View>
				{printer.error && printer.status === 'disconnected' ? (
					<Text style={styles.connectionError}>{String(printer.error)}</Text>
				) : null}
				<View style={styles.buttonsRow}>
					<Pressable
						onPress={onPressReconnect}
						disabled={isPrinting || isReconnecting || printer.status === 'connecting'}
						style={({ pressed }) => [
							styles.reconnectButton,
							pressed && styles.printButtonPressed,
							(isPrinting || isReconnecting || printer.status === 'connecting') && styles.printButtonDisabled,
						]}
						hitSlop={8}
					>
						{(isReconnecting || printer.status === 'connecting')
							? <ActivityIndicator size="small" color={purple} />
							: <CustomTextBold style={styles.reconnectButtonText}>{msg('reconnect', 'Reconnect')}</CustomTextBold>}
					</Pressable>
					<Pressable
						onPress={onPressPrint}
						disabled={!canPrint}
						style={({ pressed }) => [
							styles.printButton,
							pressed && canPrint && styles.printButtonPressed,
							!canPrint && styles.printButtonDisabled,
						]}
						hitSlop={8}
					>
						{isPrinting
							? <ActivityIndicator size="small" color={white} />
							: <CustomTextBold style={styles.printButtonText}>{strings?.print || 'Print'}</CustomTextBold>}
					</Pressable>
				</View>
			</View>
		</View>
	);
};

// ─── Styles (mostly identical to the previous file; trimmed for brevity) ─────

const s = StyleSheet.create({
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: resize(20), backgroundColor: lightOrange },
	centerText: { ...general.fontSize9, color: black, marginTop: resize(12), textAlign: 'center' },
});

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: lightOrange },
	scroll: { flex: 1, width: '100%' },
	scrollContent: { paddingVertical: resize(14), paddingBottom: resize(110), alignItems: 'center' },
	bottomBar: {
		position: 'absolute', left: 0, right: 0, bottom: 0,
		paddingHorizontal: resize(14), paddingTop: resize(12), paddingBottom: resize(16),
		backgroundColor: 'rgba(255,243,231,0.97)',
		borderTopLeftRadius: resize(18), borderTopRightRadius: resize(18),
		shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 6,
	},
	connectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
	connectionDot: { width: 9, height: 9, borderRadius: 5 },
	connectionDotConnected: { backgroundColor: green },
	connectionDotChecking: { backgroundColor: orange },
	connectionDotDisconnected: { backgroundColor: red },
	connectionText: { flex: 1, fontSize: 12, color: black },
	connectionError: { fontSize: 11, color: red, marginBottom: 6, marginLeft: 17 },
	buttonsRow: { flexDirection: 'row', gap: 8 },
	reconnectButton: {
		flex: 1, height: resize(48), borderRadius: resize(14),
		alignItems: 'center', justifyContent: 'center',
		backgroundColor: white, borderWidth: 1.5, borderColor: purple,
	},
	reconnectButtonText: { color: purple, ...general.fontSize12 },
	printButton: { flex: 1, height: resize(48), borderRadius: resize(14), alignItems: 'center', justifyContent: 'center', backgroundColor: purple },
	printButtonPressed: { opacity: 0.9 },
	printButtonDisabled: { opacity: 0.5 },
	printButtonText: { color: white, ...general.fontSize12 },
	modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
	modalCard: { backgroundColor: '#F8F4FF', borderTopLeftRadius: resize(28), borderTopRightRadius: resize(28), overflow: 'hidden', maxHeight: '88%', flex: 1 },
	modalHeader: { backgroundColor: purple, paddingTop: resize(14), paddingBottom: resize(14), paddingHorizontal: resize(16), flexDirection: 'row', alignItems: 'center', gap: resize(10) },
	modalHeaderIconWrap: { width: resize(30), height: resize(30), borderRadius: resize(15), backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
	modalTitle: { ...general.fontSize14, color: white, flex: 1 },
	modalCloseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: resize(20), padding: resize(7), alignItems: 'center', justifyContent: 'center' },
	modalHint: { ...general.fontSize8, color: gray, marginHorizontal: resize(16), marginTop: resize(12), marginBottom: resize(4), lineHeight: resize(14) },
	modalError: { ...general.fontSize8, color: red, marginHorizontal: resize(16), marginBottom: resize(8) },
	savedPrinterSection: { marginHorizontal: resize(16), marginTop: resize(14), marginBottom: resize(4) },
	sectionLabel: { ...general.fontSize8, color: gray, marginBottom: resize(6), letterSpacing: 0.6 },
	savedPrinterCard: { backgroundColor: white, borderRadius: resize(16), paddingVertical: resize(12), paddingHorizontal: resize(14), flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: purple, elevation: 3 },
	savedPrinterIconWrap: { width: resize(38), height: resize(38), borderRadius: resize(19), backgroundColor: lightOrange, alignItems: 'center', justifyContent: 'center', marginRight: resize(12) },
	savedPrinterInfo: { flex: 1 },
	savedPrinterName: { ...general.fontSize12, color: black },
	savedPrinterMacText: { ...general.fontSize8, color: gray, marginTop: resize(2) },
	forgetBtn: { padding: resize(8), borderRadius: resize(10), backgroundColor: 'rgba(220,53,69,0.09)' },
	devicesSection: { flex: 1, marginTop: resize(14) },
	devicesSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: resize(16), marginBottom: resize(8) },
	scanBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: resize(12), paddingVertical: resize(6), borderRadius: resize(20), backgroundColor: lightOrange, borderWidth: 1, borderColor: purple },
	scanBtnText: { ...general.fontSize10, color: purple },
	deviceRow: { backgroundColor: white, borderRadius: resize(14), paddingVertical: resize(10), paddingHorizontal: resize(14), marginHorizontal: resize(16), marginBottom: resize(8), flexDirection: 'row', alignItems: 'center', elevation: 1 },
	deviceRowSaved: { borderWidth: 1.5, borderColor: purple, backgroundColor: lightOrange },
	deviceRowPressed: { opacity: 0.75 },
	deviceIconWrap: { width: resize(34), height: resize(34), borderRadius: resize(17), backgroundColor: lightOrange, alignItems: 'center', justifyContent: 'center', marginRight: resize(12) },
	deviceIconWrapSaved: { backgroundColor: purple },
	deviceInfo: { flex: 1 },
	deviceName: { ...general.fontSize12, color: black },
	deviceNameSaved: { color: purple },
	deviceMac: { ...general.fontSize8, color: gray, marginTop: resize(2) },
	deviceMacSaved: { color: purple, opacity: 0.7 },
	deviceCheck: { marginLeft: resize(6) },
	scanningState: { alignItems: 'center', paddingVertical: resize(32), gap: resize(12) },
	scanningText: { ...general.fontSize10, color: gray },
	emptyState: { alignItems: 'center', paddingVertical: resize(28), gap: resize(8) },
	modalEmpty: { textAlign: 'center', color: gray, ...general.fontSize10 },
	modalEmptyHint: { textAlign: 'center', color: gray, ...general.fontSize8, opacity: 0.75 },
	meta: { width: '100%', maxWidth: 520, paddingHorizontal: resize(12), marginBottom: resize(8) },
	metaText: { fontFamily: monoFontRegular, fontSize: resize(10), color: gray },
	paper: { backgroundColor: '#FEFEFE', borderRadius: resize(12), paddingHorizontal: resize(10), paddingVertical: resize(10), borderWidth: 1, borderColor: '#e8e8e8', elevation: 2 },
	block: { marginVertical: 2 },
	lineText: { position: 'absolute', top: 0, includeFontPadding: false, color: '#111' },
	imgPlaceholder: { borderWidth: 1, borderColor: '#D0D5DD', backgroundColor: '#F6F7F9', padding: 8, borderRadius: 8 },
	imgPlaceholderText: { fontFamily: monoFontRegular, fontSize: 12, color: '#667085' },
	errIcon: { fontSize: 42, color: orange, fontWeight: '800' },
});

export default PrintPreviewScreen;
