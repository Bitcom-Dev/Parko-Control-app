// util/printer/btPrinter.js
// ─────────────────────────────────────────────────────────────────────────────
// Singleton wrapper around our native BTClassicPrinter module.
//
// Goals:
//   • One owner of the BT socket — any screen subscribes to the same status.
//   • Auto-connect on app start (and on demand) to the last-used printer.
//   • Heartbeat ping every 5s to detect silent disconnects (printer powered off
//     out of range without a clean ACL_DISCONNECT broadcast).
//   • Native event `BTPrinterDisconnected` flips status to 'disconnected' instantly.
//   • UI binds the Print button to `status === 'connected'`, so the user CAN'T
//     fire a print on a dead socket — which is what was crashing the app.
//
// Status state machine:
//   'idle' → initial, no saved printer
//   'connecting' → connect() in flight
//   'connected' → socket live + last ping ok
//   'printing' → a print job is currently sending bytes
//   'disconnected' → was connected, lost link
//   'unavailable' → native module missing / iOS / Web
// ─────────────────────────────────────────────────────────────────────────────

import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getValueAsync, setValueAsync, removeValueAsync } from '../storage';

const { BTClassicPrinter } = NativeModules;
const nativeAvailable = !!BTClassicPrinter && Platform.OS === 'android';

const STORAGE_KEYS = {
	mac: 'printer_ble_inner_mac_address', // kept same key for migration from old code
	name: 'printer_ble_device_name',
};

const HEARTBEAT_MS = 5000;
const CONNECT_TIMEOUT_MS = 15000;

// Wrap a promise with a timeout — used so a hung native call never freezes the UI.
const withTimeout = (p, ms, label) =>
	Promise.race([
		p,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms),
		),
	]);

class BluetoothPrinter {
	constructor() {
		this._status = nativeAvailable ? 'idle' : 'unavailable';
		this._mac = null;
		this._name = '';
		this._error = null;
		this._listeners = new Set();
		this._connectInFlight = false;
		this._heartbeatHandle = null;
		this._emitter = null;
		this._nativeSubs = [];

		if (nativeAvailable) {
			this._emitter = new NativeEventEmitter(BTClassicPrinter);
			this._nativeSubs.push(
				this._emitter.addListener('BTPrinterDisconnected', (evt) => {
					// Only react if it's our printer.
					if (!this._mac || !evt?.mac) return;
					if (String(evt.mac).toLowerCase() !== String(this._mac).toLowerCase()) return;
					this._setStatus('disconnected', { error: 'Printer disconnected.' });
					this._stopHeartbeat();
				}),
			);
			this._nativeSubs.push(
				this._emitter.addListener('BTPrinterConnected', (evt) => {
					if (!evt?.mac) return;
					if (this._mac && String(evt.mac).toLowerCase() !== String(this._mac).toLowerCase()) return;
					this._mac = String(evt.mac);
					if (evt.name) this._name = String(evt.name);
					this._setStatus('connected');
					this._startHeartbeat();
				}),
			);
		}
	}

	// ─── Subscription API ──────────────────────────────────────────────────────

	subscribe(listener) {
		this._listeners.add(listener);
		// Emit current state synchronously so the subscriber renders immediately.
		try { listener(this.snapshot()); } catch (_) {}
		return () => { this._listeners.delete(listener); };
	}

	snapshot() {
		return {
			status: this._status,
			mac: this._mac,
			name: this._name,
			error: this._error,
			isAvailable: nativeAvailable,
			canPrint: this._status === 'connected',
		};
	}

	_emit() {
		const snap = this.snapshot();
		for (const l of this._listeners) {
			try { l(snap); } catch (_) {}
		}
	}

	_setStatus(status, extras = {}) {
		this._status = status;
		if (Object.prototype.hasOwnProperty.call(extras, 'error')) this._error = extras.error;
		else if (status === 'connected' || status === 'connecting' || status === 'printing') this._error = null;
		this._emit();
	}

	// ─── Permissions ───────────────────────────────────────────────────────────

	async ensurePermissions() {
		if (Platform.OS !== 'android') return true;
		try {
			const sdkInt = Number(Platform.Version);
			const perms = [];
			if (sdkInt >= 31) {
				perms.push(
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
					PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
				);
			} else {
				perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
			}
			const res = await PermissionsAndroid.requestMultiple(perms);
			return perms.every((p) => res?.[p] === PermissionsAndroid.RESULTS.GRANTED);
		} catch (_e) {
			return false;
		}
	}

	// ─── Storage of last-used printer ──────────────────────────────────────────

	async loadSavedPrinter() {
		const [mac, name] = await Promise.all([
			getValueAsync(STORAGE_KEYS.mac),
			getValueAsync(STORAGE_KEYS.name),
		]);
		this._mac = mac || null;
		this._name = name || '';
		this._emit();
		return { mac: this._mac, name: this._name };
	}

	async setSavedPrinter(mac, name) {
		this._mac = String(mac);
		this._name = String(name || 'Printer');
		await setValueAsync(STORAGE_KEYS.mac, this._mac);
		await setValueAsync(STORAGE_KEYS.name, this._name);
		this._emit();
	}

	async forgetSavedPrinter() {
		await removeValueAsync(STORAGE_KEYS.mac);
		await removeValueAsync(STORAGE_KEYS.name);
		this._mac = null;
		this._name = '';
		await this.disconnect().catch(() => {});
		this._setStatus(nativeAvailable ? 'idle' : 'unavailable', { error: null });
	}

	// ─── Native calls ──────────────────────────────────────────────────────────

	async listPairedDevices() {
		if (!nativeAvailable) throw new Error('Bluetooth printer module not available on this platform.');
		const ok = await this.ensurePermissions();
		if (!ok) throw new Error('Bluetooth permissions not granted.');
		const list = await BTClassicPrinter.getPairedDevices();
		return Array.isArray(list) ? list : [];
	}

	async isAdapterReady() {
		if (!nativeAvailable) return { hasAdapter: false, adapterEnabled: false, hasPermission: false };
		return BTClassicPrinter.isReady();
	}

	/**
	 * Connect to a printer. If `mac` is omitted, uses the saved one.
	 * Returns { ok: true } on success or { ok: false, reason, error } on failure.
	 * This method NEVER throws — it always returns a result object — so callers
	 * don't have to wrap everything in try/catch.
	 */
	async connect(mac) {
		if (!nativeAvailable) {
			this._setStatus('unavailable', { error: 'Module not available on this platform.' });
			return { ok: false, reason: 'unavailable' };
		}
		if (this._connectInFlight) return { ok: false, reason: 'busy' };
		this._connectInFlight = true;
		try {
			const targetMac = mac || this._mac;
			if (!targetMac) {
				this._setStatus('idle', { error: 'No saved printer.' });
				return { ok: false, reason: 'no-saved-printer' };
			}

			const okPerms = await this.ensurePermissions();
			if (!okPerms) {
				this._setStatus('disconnected', { error: 'Bluetooth permissions denied.' });
				return { ok: false, reason: 'permissions' };
			}
			const ready = await this.isAdapterReady();
			if (!ready?.adapterEnabled) {
				this._setStatus('disconnected', { error: 'Bluetooth is turned off.' });
				return { ok: false, reason: 'adapter-disabled' };
			}

			this._setStatus('connecting');
			await withTimeout(BTClassicPrinter.connect(String(targetMac)), CONNECT_TIMEOUT_MS, 'connect');
			// `BTPrinterConnected` event handler will flip status to 'connected'
			// AND start the heartbeat — but flip optimistically here too in case the
			// emitter delivers slightly later.
			this._mac = String(targetMac);
			this._setStatus('connected');
			this._startHeartbeat();
			// Best-effort: persist whichever name we have.
			if (this._mac) await setValueAsync(STORAGE_KEYS.mac, this._mac);
			if (this._name) await setValueAsync(STORAGE_KEYS.name, this._name);
			return { ok: true, mac: this._mac, name: this._name };
		} catch (e) {
			const msg = String(e?.message || e);
			this._setStatus('disconnected', { error: msg });
			return { ok: false, reason: 'connect-failed', error: msg };
		} finally {
			this._connectInFlight = false;
		}
	}

	async disconnect() {
		this._stopHeartbeat();
		if (!nativeAvailable) {
			this._setStatus('unavailable');
			return;
		}
		try { await BTClassicPrinter.disconnect(); } catch (_) {}
		this._setStatus(this._mac ? 'disconnected' : 'idle');
	}

	// ─── Heartbeat ─────────────────────────────────────────────────────────────

	_startHeartbeat() {
		this._stopHeartbeat();
		if (!nativeAvailable) return;
		this._heartbeatHandle = setInterval(async () => {
			// Skip while a print is in progress — printing already proves the link works.
			if (this._status === 'printing' || this._status === 'connecting') return;
			try {
				await withTimeout(BTClassicPrinter.ping(), 4000, 'heartbeat');
				// If we'd been mistakenly marked disconnected, recover.
				if (this._status !== 'connected') this._setStatus('connected');
			} catch (_e) {
				// Native already emitted BTPrinterDisconnected on real disconnects, but
				// belt-and-braces: flip status here too.
				if (this._status === 'connected') {
					this._setStatus('disconnected', { error: 'Lost connection to printer.' });
				}
				this._stopHeartbeat();
			}
		}, HEARTBEAT_MS);
	}

	_stopHeartbeat() {
		if (this._heartbeatHandle) {
			clearInterval(this._heartbeatHandle);
			this._heartbeatHandle = null;
		}
	}

	// ─── Print primitives — used by executePrintJobs() ─────────────────────────

	beginPrint() { if (this._status === 'connected') this._setStatus('printing'); }
	endPrint(success) {
		if (this._status === 'printing') {
			this._setStatus(success ? 'connected' : 'disconnected',
				success ? {} : { error: 'Print failed.' });
		}
		// Restart heartbeat after a print burst.
		if (success && nativeAvailable) this._startHeartbeat();
	}

	/** Sends a base64-encoded ESC/POS byte blob to the printer. Throws on failure. */
	async writeBase64(base64) {
		if (!nativeAvailable) throw new Error('Bluetooth printer module not available.');
		if (this._status !== 'connected' && this._status !== 'printing') {
			throw new Error('Printer is not connected.');
		}
		await BTClassicPrinter.writeBase64(String(base64 || ''));
	}

	/**
	 * @param paperWidthDots total printable paper width (e.g. 832 for DPP-450).
	 *                       Used to bake center/right alignment into the bitmap
	 *                       as left-padding columns — because ESC a alone does
	 *                       NOT work across multi-band ESC * images.
	 */
	async printImageBase64(base64, widthDots, alignment, paperWidthDots) {
		if (!nativeAvailable) throw new Error('Bluetooth printer module not available.');
		if (this._status !== 'connected' && this._status !== 'printing') {
			throw new Error('Printer is not connected.');
		}
		await BTClassicPrinter.printImageBase64(
			String(base64 || ''),
			Number(widthDots) || 384,
			Number(alignment) || 0,
			Number(paperWidthDots) || 0,
		);
	}
}

const btPrinter = new BluetoothPrinter();

// React-friendly hook.
import { useEffect, useState } from 'react';

export const useBtPrinter = () => {
	const [snap, setSnap] = useState(btPrinter.snapshot());
	useEffect(() => btPrinter.subscribe(setSnap), []);
	return snap;
};

export default btPrinter;
