package com.parkocontrol.bordeac03.btprinter;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * React Native bridge for the Bluetooth Classic (SPP) printer connection.
 *
 * Exposes a small, promise-based API to JS — every call resolves OR rejects exactly once,
 * never both. All blocking work runs on a dedicated single-thread executor so JS calls
 * are serialized in arrival order (this matters: the old library fired writes in parallel
 * which is what caused the GATT-error-133 / IOException crashes).
 */
public class BTClassicPrinterModule extends ReactContextBaseJavaModule {

    private static final String TAG = "BTClassicPrinter";
    public static final String MODULE_NAME = "BTClassicPrinter";

    private final ReactApplicationContext mReactCtx;
    private final ExecutorService mIo = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "bt-classic-printer-io");
        t.setDaemon(true);
        return t;
    });

    public BTClassicPrinterModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.mReactCtx = reactContext;
        BTConnectionManager.get().attachContext(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ─── Permission helper ───────────────────────────────────────────────────

    private boolean hasBtConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true; // pre-Android-12 → granted via manifest
        return ContextCompat.checkSelfPermission(
                mReactCtx, Manifest.permission.BLUETOOTH_CONNECT
        ) == PackageManager.PERMISSION_GRANTED;
    }

    // ─── JS-exposed methods (all promise-based; never resolve+reject the same promise) ─

    /** Tells JS whether bluetooth is on AND we have BLUETOOTH_CONNECT permission. */
    @ReactMethod
    public void isReady(Promise promise) {
        try {
            BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
            WritableMap out = Arguments.createMap();
            out.putBoolean("hasAdapter", a != null);
            out.putBoolean("adapterEnabled", a != null && a.isEnabled());
            out.putBoolean("hasPermission", hasBtConnectPermission());
            promise.resolve(out);
        } catch (Throwable t) {
            promise.reject("BT_READY_ERR", t.getMessage(), t);
        }
    }

    /** Returns the list of paired devices (every Datecs printer is paired before first use). */
    @ReactMethod
    public void getPairedDevices(Promise promise) {
        try {
            if (!hasBtConnectPermission()) {
                promise.reject("BT_PERM_MISSING", "BLUETOOTH_CONNECT permission not granted");
                return;
            }
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                promise.reject("BT_NO_ADAPTER", "No Bluetooth adapter on this device");
                return;
            }
            if (!adapter.isEnabled()) {
                promise.reject("BT_DISABLED", "Bluetooth is turned off");
                return;
            }
            WritableArray list = Arguments.createArray();
            Set<BluetoothDevice> paired;
            try {
                paired = adapter.getBondedDevices();
            } catch (SecurityException se) {
                promise.reject("BT_PERM_MISSING", se.getMessage());
                return;
            }
            if (paired != null) {
                for (BluetoothDevice d : paired) {
                    WritableMap entry = Arguments.createMap();
                    String name = "";
                    try { name = d.getName(); } catch (SecurityException ignored) {}
                    entry.putString("name", name == null ? "" : name);
                    entry.putString("mac", d.getAddress() == null ? "" : d.getAddress());
                    // BluetoothClass major device class — Datecs reports IMAGING(0x0600) for printers.
                    int majorClass = 0;
                    try {
                        if (d.getBluetoothClass() != null) {
                            majorClass = d.getBluetoothClass().getMajorDeviceClass();
                        }
                    } catch (Throwable ignored) {}
                    entry.putInt("majorClass", majorClass);
                    entry.putBoolean("isLikelyPrinter",
                            majorClass == 0x0600 // IMAGING (printers, scanners…)
                            || (name != null && name.toLowerCase().contains("dpp"))
                            || (name != null && name.toLowerCase().contains("datecs")));
                    list.pushMap(entry);
                }
            }
            promise.resolve(list);
        } catch (Throwable t) {
            promise.reject("BT_LIST_ERR", t.getMessage(), t);
        }
    }

    /** Connects to a paired printer by MAC. Runs on the IO executor; promise resolves on success. */
    @ReactMethod
    public void connect(String mac, Promise promise) {
        if (!hasBtConnectPermission()) {
            promise.reject("BT_PERM_MISSING", "BLUETOOTH_CONNECT permission not granted");
            return;
        }
        mIo.execute(() -> {
            try {
                BTConnectionManager.get().connect(mac);
                WritableMap out = Arguments.createMap();
                out.putBoolean("connected", true);
                out.putString("mac", mac);
                promise.resolve(out);
            } catch (Throwable t) {
                Log.w(TAG, "connect(" + mac + ") failed: " + t.getMessage());
                promise.reject("BT_CONNECT_FAIL", t.getMessage(), t);
            }
        });
    }

    @ReactMethod
    public void disconnect(Promise promise) {
        mIo.execute(() -> {
            try {
                BTConnectionManager.get().disconnect();
                promise.resolve(true);
            } catch (Throwable t) {
                promise.reject("BT_DISCONNECT_ERR", t.getMessage(), t);
            }
        });
    }

    /** Cheap synchronous probe used by JS heartbeat. */
    @ReactMethod
    public void isConnected(Promise promise) {
        try {
            WritableMap out = Arguments.createMap();
            out.putBoolean("connected", BTConnectionManager.get().isConnected());
            String mac = BTConnectionManager.get().getConnectedMac();
            out.putString("mac", mac == null ? "" : mac);
            promise.resolve(out);
        } catch (Throwable t) {
            promise.reject("BT_STATUS_ERR", t.getMessage(), t);
        }
    }

    /**
     * Heartbeat write — sends a 0-length flush + a single NUL byte and confirms it reached the kernel.
     * If the remote side is gone this throws and the receiver triggers `BTPrinterDisconnected`.
     */
    @ReactMethod
    public void ping(Promise promise) {
        mIo.execute(() -> {
            try {
                BTConnectionManager.get().write(new byte[] { 0x00 });
                promise.resolve(true);
            } catch (IOException ioe) {
                promise.reject("BT_PING_FAIL", ioe.getMessage(), ioe);
            } catch (Throwable t) {
                promise.reject("BT_PING_ERR", t.getMessage(), t);
            }
        });
    }

    /** Send raw base64-encoded ESC/POS bytes. */
    @ReactMethod
    public void writeBase64(String base64, Promise promise) {
        mIo.execute(() -> {
            try {
                if (base64 == null || base64.isEmpty()) {
                    promise.resolve(true);
                    return;
                }
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                BTConnectionManager.get().write(data);
                promise.resolve(true);
            } catch (IOException ioe) {
                promise.reject("BT_WRITE_FAIL", ioe.getMessage(), ioe);
            } catch (IllegalArgumentException iae) {
                promise.reject("BT_WRITE_BAD_BASE64", iae.getMessage(), iae);
            } catch (Throwable t) {
                promise.reject("BT_WRITE_ERR", t.getMessage(), t);
            }
        });
    }

    /**
     * Rasterize a PNG/JPEG (base64) to ESC/POS ESC * bit-image bytes and send.
     *
     * @param widthDots       desired width of the actual image, in dots
     * @param alignment       0=left, 1=center, 2=right
     * @param paperWidthDots  total printable paper width in dots (e.g. 832 for DPP-450).
     *                        Required to bake the alignment into the bitmap as
     *                        white padding columns on the left — ESC a alone
     *                        does NOT work across multi-band ESC * images on DPP-450.
     *                        Pass 0 to disable padding (image will print left-aligned).
     */
    @ReactMethod
    public void printImageBase64(String base64, int widthDots, int alignment, int paperWidthDots, Promise promise) {
        mIo.execute(() -> {
            try {
                if (base64 == null || base64.isEmpty()) {
                    promise.resolve(true);
                    return;
                }
                byte[] escposBytes = EscPosImage.rasterize(base64, widthDots, alignment, paperWidthDots);
                BTConnectionManager.get().write(escposBytes);
                promise.resolve(true);
            } catch (IOException ioe) {
                promise.reject("BT_IMG_WRITE_FAIL", ioe.getMessage(), ioe);
            } catch (Throwable t) {
                promise.reject("BT_IMG_ERR", t.getMessage(), t);
            }
        });
    }

    // No-op stubs required by the new architecture event emitter spec; harmless on bridge.
    @ReactMethod public void addListener(String eventName) { /* no-op */ }
    @ReactMethod public void removeListeners(Integer count) { /* no-op */ }
}
