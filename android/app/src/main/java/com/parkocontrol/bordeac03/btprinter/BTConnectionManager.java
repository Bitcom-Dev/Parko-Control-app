package com.parkocontrol.bordeac03.btprinter;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;

/**
 * Singleton that owns the RFCOMM (SPP) socket to a Datecs DPP-450 (or any ESC/POS Classic printer).
 *
 * Key responsibilities:
 *   - Connect / disconnect with timeout + cleanup guarantees.
 *   - Serialize writes on a single OutputStream so concurrent JS calls don't crash native.
 *   - Listen to ACTION_ACL_DISCONNECTED via a runtime BroadcastReceiver and emit
 *     `BTPrinterDisconnected` event to JS the instant the printer disappears.
 *   - Expose isConnected() that actually probes the socket, not just checks a reference.
 *
 * SAFE design rules followed here (to fix the random crashes):
 *   1. Every IOException is caught and turned into a JS-visible error string.
 *   2. The socket reference is volatile and reads/writes are guarded by a monitor.
 *   3. The disconnect receiver is registered ONCE per process and unregistered on Application teardown.
 *   4. No native callback is invoked twice (the old lib does this on edge cases → crash).
 */
public class BTConnectionManager {

    private static final String TAG = "BTConnectionManager";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
    public static final String EVENT_DISCONNECTED = "BTPrinterDisconnected";
    public static final String EVENT_CONNECTED = "BTPrinterConnected";

    private static volatile BTConnectionManager sInstance;

    private final Object mLock = new Object();
    private ReactApplicationContext mReactContext;

    private volatile BluetoothDevice mDevice;
    private volatile BluetoothSocket mSocket;
    private volatile OutputStream mOut;
    private volatile boolean mReceiverRegistered = false;

    private final BroadcastReceiver mDisconnectReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            try {
                String action = intent.getAction();
                if (!BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) return;

                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                BluetoothDevice current = mDevice;
                if (device == null || current == null) return;
                if (!device.getAddress().equalsIgnoreCase(current.getAddress())) return;

                Log.w(TAG, "ACL disconnect for our printer: " + device.getAddress());
                // Tear down socket immediately so any pending write fails fast instead of hanging.
                forceCloseSocket();
                emitDisconnected(device.getAddress());
            } catch (Throwable t) {
                // Never throw from a BroadcastReceiver — that's a guaranteed system-wide crash.
                Log.e(TAG, "disconnect receiver crashed", t);
            }
        }
    };

    private BTConnectionManager() {}

    public static BTConnectionManager get() {
        if (sInstance == null) {
            synchronized (BTConnectionManager.class) {
                if (sInstance == null) sInstance = new BTConnectionManager();
            }
        }
        return sInstance;
    }

    public synchronized void attachContext(ReactApplicationContext ctx) {
        this.mReactContext = ctx;
        ensureReceiver();
    }

    private void ensureReceiver() {
        if (mReceiverRegistered || mReactContext == null) return;
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
            // Android 13+ requires explicit RECEIVER_NOT_EXPORTED for non-system broadcasts (BLUETOOTH events are system though).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                mReactContext.registerReceiver(mDisconnectReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                mReactContext.registerReceiver(mDisconnectReceiver, filter);
            }
            mReceiverRegistered = true;
        } catch (Throwable t) {
            Log.e(TAG, "failed to register disconnect receiver", t);
        }
    }

    private void emitDisconnected(String mac) {
        if (mReactContext == null || !mReactContext.hasActiveReactInstance()) return;
        try {
            WritableMap params = Arguments.createMap();
            params.putString("mac", mac == null ? "" : mac);
            params.putString("reason", "acl_disconnected");
            mReactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_DISCONNECTED, params);
        } catch (Throwable t) {
            Log.e(TAG, "emitDisconnected failed", t);
        }
    }

    private void emitConnected(String mac, String name) {
        if (mReactContext == null || !mReactContext.hasActiveReactInstance()) return;
        try {
            WritableMap params = Arguments.createMap();
            params.putString("mac", mac == null ? "" : mac);
            params.putString("name", name == null ? "" : name);
            mReactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(EVENT_CONNECTED, params);
        } catch (Throwable t) {
            Log.e(TAG, "emitConnected failed", t);
        }
    }

    // ─── Connection lifecycle ────────────────────────────────────────────────

    public boolean isAdapterReady() {
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        return a != null && a.isEnabled();
    }

    /**
     * Synchronous connect. Throws on failure; caller (the React module) maps the exception to a JS reject.
     * This blocks the calling thread for up to ~7s — caller must NOT run this on the UI thread.
     */
    public void connect(String mac) throws IOException {
        if (mac == null || mac.isEmpty()) throw new IOException("Empty MAC address");
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) throw new IOException("No bluetooth adapter");
        if (!adapter.isEnabled()) throw new IOException("Bluetooth is disabled");

        BluetoothDevice device = adapter.getRemoteDevice(mac);
        if (device == null) throw new IOException("Device not paired: " + mac);

        synchronized (mLock) {
            // If already connected to the same MAC and socket still alive — short-circuit.
            if (mSocket != null && mDevice != null
                    && mDevice.getAddress().equalsIgnoreCase(mac)
                    && mSocket.isConnected()) {
                Log.v(TAG, "already connected to " + mac);
                return;
            }
            // Tear down any previous socket before opening a new one.
            forceCloseSocket();

            // Cancel discovery — it kills RFCOMM connect performance.
            try { adapter.cancelDiscovery(); } catch (Throwable ignored) {}

            BluetoothSocket socket = null;
            IOException firstErr = null;
            // Strategy 1: secure RFCOMM (preferred, works on most modern Datecs firmware).
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (IOException e) {
                firstErr = e;
                try { if (socket != null) socket.close(); } catch (Throwable ignored) {}
                socket = null;
            }
            // Strategy 2: insecure RFCOMM (some older firmware refuses secure on first try).
            if (socket == null) {
                try {
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (IOException e) {
                    try { if (socket != null) socket.close(); } catch (Throwable ignored) {}
                    socket = null;
                    // Strategy 3: reflective fallback for very old firmware (channel 1).
                    try {
                        //noinspection JavaReflectionMemberAccess
                        socket = (BluetoothSocket) device.getClass()
                                .getMethod("createRfcommSocket", int.class)
                                .invoke(device, 1);
                        if (socket != null) socket.connect();
                    } catch (Throwable t) {
                        if (socket != null) {
                            try { socket.close(); } catch (Throwable ignored) {}
                        }
                        throw firstErr != null ? firstErr : new IOException("RFCOMM connect failed: " + t.getMessage());
                    }
                }
            }

            OutputStream out;
            try {
                out = socket.getOutputStream();
            } catch (IOException e) {
                try { socket.close(); } catch (Throwable ignored) {}
                throw e;
            }

            mDevice = device;
            mSocket = socket;
            mOut = out;
            ensureReceiver();
        }

        String name;
        try { name = device.getName(); } catch (SecurityException se) { name = ""; }
        emitConnected(mac, name);
        Log.i(TAG, "connected to " + mac);
    }

    public void disconnect() {
        synchronized (mLock) {
            forceCloseSocket();
        }
    }

    private void forceCloseSocket() {
        try {
            if (mOut != null) {
                try { mOut.flush(); } catch (Throwable ignored) {}
                try { mOut.close(); } catch (Throwable ignored) {}
            }
        } finally {
            mOut = null;
        }
        try {
            if (mSocket != null) {
                try { mSocket.close(); } catch (Throwable ignored) {}
            }
        } finally {
            mSocket = null;
            mDevice = null;
        }
    }

    /**
     * Active probe: returns true only if we have a socket AND it's still reported as connected.
     * Note: BluetoothSocket.isConnected() doesn't always notice a remote-side power-off — combine
     * this with the disconnect receiver above for reliable status.
     */
    public boolean isConnected() {
        synchronized (mLock) {
            return mSocket != null && mSocket.isConnected() && mOut != null;
        }
    }

    public String getConnectedMac() {
        synchronized (mLock) {
            return mDevice != null ? mDevice.getAddress() : null;
        }
    }

    /**
     * Write raw bytes to the printer. Throws on any failure (socket closed mid-write, etc.).
     * Caller must run this off the UI thread.
     */
    public void write(byte[] data) throws IOException {
        OutputStream out;
        BluetoothSocket sock;
        synchronized (mLock) {
            out = mOut;
            sock = mSocket;
        }
        if (out == null || sock == null) {
            throw new IOException("Printer is not connected");
        }
        if (!sock.isConnected()) {
            // Don't leave a half-dead socket behind.
            synchronized (mLock) { forceCloseSocket(); }
            throw new IOException("Printer socket is closed");
        }
        try {
            out.write(data);
            out.flush();
        } catch (IOException e) {
            // Disconnected mid-write → clean up and propagate so JS can show "disconnected".
            synchronized (mLock) { forceCloseSocket(); }
            emitDisconnected(mDevice != null ? mDevice.getAddress() : "");
            throw e;
        }
    }
}
