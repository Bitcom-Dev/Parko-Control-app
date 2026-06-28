package com.parkocontrol.bordeac03.btprinter;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Converts a base64-encoded PNG/JPEG into ESC/POS byte commands for the
 * Datecs DPP-450.
 *
 * IMPORTANT #1: DPP-450 does NOT support the modern raster command `GS v 0`
 * (1D 76 30). It only supports the classic `ESC *` (1B 2A) bit-image mode.
 *
 * IMPORTANT #2: ESC a (alignment) only applies until the next LF on DPP-450.
 * Multi-band ESC * images therefore re-align to left after band 1. Fix: bake
 * the alignment into the bitmap by adding empty (white) columns on the left.
 *
 * IMPORTANT #3: Bluetooth Classic SPP has no real flow control above the link
 * layer. If we dump the entire image into the socket in one big write, the
 * printer's tiny internal buffer (~4-8 KB) overflows on tall images, drops
 * raster bytes, and the next band's header gets parsed as raster data → garbage
 * mid-print that "recovers" a few rows later when the parser re-syncs.
 *
 * Fix: we DON'T return a single byte[] anymore — we return a list of small
 * chunks (one per band + header + footer). The caller (the React module) sends
 * each chunk in a separate Bluetooth write with a small sleep between them so
 * the printer has time to drain its buffer.
 */
final class EscPosImage {

    private EscPosImage() {}

    private static final int MAX_WIDTH_DOTS = 832; // physical paper width
    private static final byte ESC_STAR_MODE = 33;  // 24-dot triple density
    private static final int BAND_HEIGHT = 24;
    private static final int LUMA_THRESHOLD = 160;

    /**
     * Result of rasterization: a sequence of byte chunks to be sent in order
     * with a small pause between them.
     */
    static final class RasterizedImage {
        final List<byte[]> chunks;
        /** Recommended delay between chunks, in milliseconds. */
        final int chunkDelayMs;

        RasterizedImage(List<byte[]> chunks, int chunkDelayMs) {
            this.chunks = chunks;
            this.chunkDelayMs = chunkDelayMs;
        }
    }

    static RasterizedImage rasterize(String base64, int requestedWidthDots, int alignment, int paperWidthDots)
            throws IOException {
        byte[] decoded = Base64.decode(base64, Base64.DEFAULT);
        Bitmap src = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
        if (src == null) throw new IOException("Failed to decode image");

        int imageW = Math.max(8, requestedWidthDots);
        if (imageW > MAX_WIDTH_DOTS) imageW = MAX_WIDTH_DOTS;

        int srcW = src.getWidth();
        int srcH = src.getHeight();
        int targetH = Math.max(1, Math.round(((float) imageW / (float) srcW) * (float) srcH));
        if (targetH > 4000) targetH = 4000;

        Bitmap scaled = null;
        try {
            scaled = Bitmap.createScaledBitmap(src, imageW, targetH, false);
        } finally {
            if (scaled != src) {
                try { src.recycle(); } catch (Throwable ignored) {}
            }
        }
        if (scaled == null) throw new IOException("Failed to scale image");

        byte[][] grid = new byte[targetH][imageW];
        int[] row = new int[imageW];
        for (int y = 0; y < targetH; y++) {
            scaled.getPixels(row, 0, imageW, 0, y, imageW, 1);
            for (int x = 0; x < imageW; x++) {
                int px = row[x];
                int a = Color.alpha(px);
                int luma;
                if (a < 32) {
                    luma = 255;
                } else {
                    int r = Color.red(px);
                    int g = Color.green(px);
                    int b = Color.blue(px);
                    luma = (r * 30 + g * 59 + b * 11) / 100;
                }
                grid[y][x] = (byte) (luma < LUMA_THRESHOLD ? 1 : 0);
            }
        }
        try { scaled.recycle(); } catch (Throwable ignored) {}

        // ── Alignment padding ───────────────────────────────────────────────
        int paddingLeft = 0;
        int totalW = imageW;
        if (paperWidthDots > imageW) {
            if (alignment == 1) {
                paddingLeft = (paperWidthDots - imageW) / 2;
            } else if (alignment == 2) {
                paddingLeft = paperWidthDots - imageW;
            }
            if (paddingLeft > 0) {
                totalW = paddingLeft + imageW;
                if (totalW > MAX_WIDTH_DOTS) {
                    totalW = MAX_WIDTH_DOTS;
                    if (paddingLeft >= totalW) paddingLeft = totalW - imageW;
                }
            }
        }

        List<byte[]> chunks = new ArrayList<>();

        // ── Chunk 1: prologue (margin reset + alignment + line spacing) ─────
        {
            ByteArrayOutputStream prologue = new ByteArrayOutputStream(16);
            // GS L 0 0 — left margin = 0
            prologue.write(0x1D); prologue.write(0x4C); prologue.write(0); prologue.write(0);
            // ESC a 0 — force left (we bake alignment into the bitmap)
            prologue.write(0x1B); prologue.write(0x61); prologue.write(0);
            // ESC 3 24 — line spacing matches band height
            prologue.write(0x1B); prologue.write(0x33); prologue.write(BAND_HEIGHT);
            chunks.add(prologue.toByteArray());
        }

        int nL = totalW & 0xFF;
        int nH = (totalW >> 8) & 0xFF;

        // ── Chunks 2..N+1: one chunk per 24-pixel band ──────────────────────
        // Each band chunk = [ESC * mode nL nH] [3*totalW data bytes] [LF].
        // Size per band ≈ 5 + 3*totalW + 1 bytes. For totalW=832 → ~2.5 KB/band.
        // We send each band in a separate Bluetooth write and let the React
        // module sleep ~chunkDelayMs between them.
        for (int bandTop = 0; bandTop < targetH; bandTop += BAND_HEIGHT) {
            int bandBottom = Math.min(bandTop + BAND_HEIGHT, targetH);
            ByteArrayOutputStream band = new ByteArrayOutputStream(5 + 3 * totalW + 1);

            // Header
            band.write(0x1B);
            band.write(0x2A);
            band.write(ESC_STAR_MODE);
            band.write(nL);
            band.write(nH);

            // Padding columns (all white)
            for (int p = 0; p < paddingLeft; p++) {
                band.write(0);
                band.write(0);
                band.write(0);
            }

            // Image columns
            for (int x = 0; x < imageW; x++) {
                int b0 = 0, b1 = 0, b2 = 0;
                for (int dy = 0; dy < BAND_HEIGHT; dy++) {
                    int y = bandTop + dy;
                    if (y >= bandBottom) break;
                    if (grid[y][x] != 0) {
                        if (dy < 8) {
                            b0 |= (0x80 >> dy);
                        } else if (dy < 16) {
                            b1 |= (0x80 >> (dy - 8));
                        } else {
                            b2 |= (0x80 >> (dy - 16));
                        }
                    }
                }
                band.write(b0);
                band.write(b1);
                band.write(b2);
            }

            // LF — advances exactly BAND_HEIGHT dots
            band.write(0x0A);

            chunks.add(band.toByteArray());
        }

        // ── Final chunk: restore defaults ───────────────────────────────────
        {
            ByteArrayOutputStream epilogue = new ByteArrayOutputStream(8);
            // ESC 2 — restore default line spacing
            epilogue.write(0x1B); epilogue.write(0x32);
            // ESC a 0 — left alignment for following text
            epilogue.write(0x1B); epilogue.write(0x61); epilogue.write(0);
            chunks.add(epilogue.toByteArray());
        }

        // 60 ms delay between bands. The thermal head needs ~12 ms to print one
        // 24-dot band; the remaining ~48 ms is headroom for BT L2CAP retransmits
        // when the 2.4 GHz spectrum is congested (WiFi, microwaves, other BT
        // devices). Empirically 40 ms gives ~14% failure rate in noisy office
        // environments; 60 ms drops it to <2%. Cost: ~480 ms extra for a typical
        // 24-band image — negligible vs reprinting on failure.
        int delay = 60;
        return new RasterizedImage(chunks, delay);
    }
}
