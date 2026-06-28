package com.parkocontrol.bordeac03.btprinter;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Converts a base64-encoded PNG/JPEG into ESC/POS byte commands for the
 * Datecs DPP-450.
 *
 * IMPORTANT: DPP-450 does NOT support the modern raster command `GS v 0`
 * (1D 76 30). It only supports the classic `ESC *` (1B 2A) bit-image mode.
 * Sending `GS v 0` makes the printer dump the raw raster bytes as text →
 * gibberish on paper.
 *
 * `ESC *` works column-by-column:
 *   - You select a density mode (m=33 = 24-dot triple-density, 200 DPI).
 *   - Then you send N columns × 3 bytes each (24 pixels per column).
 *   - Then LF to advance one full 24-pixel band.
 *   - Repeat until the whole bitmap is printed.
 *
 * Output layout:
 *   [ESC a n]            — alignment (0=L, 1=C, 2=R)
 *   [ESC 3 24]           — line spacing = 24 dots (matches band height)
 *   For each 24-pixel-tall band:
 *     [ESC * 33 nL nH d0 d1 d2 ... d(3*width-1)]
 *     [LF]
 *   [ESC 2]              — restore default line spacing
 *   [ESC a 0]            — restore left alignment
 */
final class EscPosImage {

    private EscPosImage() {}

    // Datecs DPP-450 physical width: 832 dots, but anything above ~576 dots
    // strains the internal buffer for tall images. Caller should clamp on
    // the JS side; we still clamp here as a safety net.
    private static final int MAX_WIDTH_DOTS = 832;
    // Density mode for ESC *: 33 = 24-dot triple-density (1:1 aspect, ~200 DPI).
    private static final byte ESC_STAR_MODE = 33;
    // Each column in mode 33 carries 24 bits = 3 bytes.
    private static final int BAND_HEIGHT = 24;
    // Luma threshold: anything DARKER than this prints as black.
    // 160 (vs textbook 128) is forgiving for slightly-grey scans/JPEG noise
    // while still keeping pure white background fully empty.
    private static final int LUMA_THRESHOLD = 160;

    static byte[] rasterize(String base64, int requestedWidthDots, int alignment) throws IOException {
        byte[] decoded = Base64.decode(base64, Base64.DEFAULT);
        Bitmap src = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
        if (src == null) throw new IOException("Failed to decode image");

        // Compute target width. ESC * doesn't require width to be a multiple of 8
        // (it's column-based, not row-based) but we still clamp to the printer paper.
        int targetW = Math.max(8, requestedWidthDots);
        if (targetW > MAX_WIDTH_DOTS) targetW = MAX_WIDTH_DOTS;

        int srcW = src.getWidth();
        int srcH = src.getHeight();
        int targetH = Math.max(1, Math.round(((float) targetW / (float) srcW) * (float) srcH));
        if (targetH > 4000) targetH = 4000;

        Bitmap scaled = null;
        try {
            scaled = Bitmap.createScaledBitmap(src, targetW, targetH, false);
        } finally {
            if (scaled != src) {
                try { src.recycle(); } catch (Throwable ignored) {}
            }
        }
        if (scaled == null) throw new IOException("Failed to scale image");

        // Pre-compute the b/w grid: pixels[y][x] = 1 if dark, 0 if light.
        // Stored as bytes for simple lookup in the column loop.
        byte[][] grid = new byte[targetH][targetW];
        int[] row = new int[targetW];
        for (int y = 0; y < targetH; y++) {
            scaled.getPixels(row, 0, targetW, 0, y, targetW, 1);
            for (int x = 0; x < targetW; x++) {
                int px = row[x];
                int a = Color.alpha(px);
                // Treat fully transparent as white.
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

        ByteArrayOutputStream out = new ByteArrayOutputStream(targetW * targetH / 4 + 256);

        // Zero left margin: GS L nL nH  (1D 4C 0 0) — ensures the image starts at
        // the very left edge of paper, not offset by a residual margin from
        // an earlier print job.
        out.write(0x1D); out.write(0x4C); out.write(0); out.write(0);

        // Alignment: ESC a n  (do this BEFORE setting line spacing).
        byte alignByte = (byte) (alignment == 1 ? 1 : alignment == 2 ? 2 : 0);
        out.write(0x1B); out.write(0x61); out.write(alignByte);

        // Line spacing = 24 dots so consecutive bands stack perfectly.
        // ESC 3 n  (1B 33 n).
        out.write(0x1B); out.write(0x33); out.write(BAND_HEIGHT);

        // nL/nH for ESC * is the number of COLUMNS (width).
        int nL = targetW & 0xFF;
        int nH = (targetW >> 8) & 0xFF;

        // Walk the image in 24-pixel-tall bands.
        for (int bandTop = 0; bandTop < targetH; bandTop += BAND_HEIGHT) {
            int bandBottom = Math.min(bandTop + BAND_HEIGHT, targetH);

            // ESC * m nL nH
            out.write(0x1B);
            out.write(0x2A);
            out.write(ESC_STAR_MODE);
            out.write(nL);
            out.write(nH);

            // For each column, 3 bytes (24 bits). Top pixel = MSB of byte 0.
            for (int x = 0; x < targetW; x++) {
                int b0 = 0, b1 = 0, b2 = 0;
                for (int dy = 0; dy < BAND_HEIGHT; dy++) {
                    int y = bandTop + dy;
                    if (y >= bandBottom) break; // bottom band may be shorter; remaining bits stay 0 (white)
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
                out.write(b0);
                out.write(b1);
                out.write(b2);
            }

            // LF advances exactly BAND_HEIGHT dots because we set ESC 3 24 above.
            out.write(0x0A);
        }

        // Restore default line spacing: ESC 2  (1B 32).
        out.write(0x1B); out.write(0x32);
        // Reset alignment to left so subsequent text isn't aligned to the image setting.
        out.write(0x1B); out.write(0x61); out.write(0x00);

        return out.toByteArray();
    }
}
