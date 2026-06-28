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
 * IMPORTANT #1: DPP-450 does NOT support the modern raster command `GS v 0`
 * (1D 76 30). It only supports the classic `ESC *` (1B 2A) bit-image mode.
 * Sending `GS v 0` makes the printer dump the raw raster bytes as text →
 * gibberish on paper.
 *
 * IMPORTANT #2: With `ESC *`, the printer's `ESC a` (alignment) setting only
 * applies to the FIRST 24-pixel band — subsequent bands print left-aligned
 * regardless. To get a centered/right-aligned image we therefore CAN'T rely on
 * ESC a; we have to BAKE the alignment into the bitmap by padding each band
 * with white columns on the left. This way every band starts at column 0 from
 * the printer's perspective, but the actual image data is offset to give the
 * visual appearance of center/right alignment.
 *
 * `ESC *` works column-by-column:
 *   - You select a density mode (m=33 = 24-dot triple-density, 200 DPI).
 *   - Then you send N columns × 3 bytes each (24 pixels per column).
 *   - Then LF to advance one full 24-pixel band.
 *   - Repeat until the whole bitmap is printed.
 */
final class EscPosImage {

    private EscPosImage() {}

    private static final int MAX_WIDTH_DOTS = 832; // physical paper width
    private static final byte ESC_STAR_MODE = 33;  // 24-dot triple density
    private static final int BAND_HEIGHT = 24;
    private static final int LUMA_THRESHOLD = 160;

    /**
     * @param base64            base64-encoded PNG/JPEG bytes
     * @param requestedWidthDots  desired width of the actual image, in dots (≤ paperWidthDots)
     * @param alignment           0=left, 1=center, 2=right
     * @param paperWidthDots      total printable width on the paper. Used to compute
     *                            left padding that visually aligns the image.
     *                            Pass 0 or a negative value to disable padding (image
     *                            prints at left, same width as requestedWidthDots).
     */
    static byte[] rasterize(String base64, int requestedWidthDots, int alignment, int paperWidthDots)
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

        // Pre-compute b/w grid for the IMAGE region only (no padding here).
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

        // ── Compute alignment padding ───────────────────────────────────────
        // If caller passes paperWidth, we add empty (white) columns on the left
        // so the actual image appears centered or right-aligned regardless of
        // how the printer interprets ESC a between bands.
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
                    // Defensive: shouldn't happen because caller clamps imageW ≤ paperWidth ≤ MAX_WIDTH_DOTS.
                    totalW = MAX_WIDTH_DOTS;
                    if (paddingLeft >= totalW) paddingLeft = totalW - imageW;
                }
            }
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream(totalW * targetH / 4 + 256);

        // Zero left margin: GS L nL nH  (1D 4C 0 0)
        out.write(0x1D); out.write(0x4C); out.write(0); out.write(0);

        // ESC a 0  — alignment via ESC a doesn't work reliably across multiple
        // ESC * bands on DPP-450, so we force left and bake the alignment into
        // the bitmap below via paddingLeft.
        out.write(0x1B); out.write(0x61); out.write(0);

        // Line spacing = BAND_HEIGHT so consecutive bands stack perfectly.
        out.write(0x1B); out.write(0x33); out.write(BAND_HEIGHT);

        // nL/nH for ESC * is the total number of COLUMNS (padding + image).
        int nL = totalW & 0xFF;
        int nH = (totalW >> 8) & 0xFF;

        // Walk the image in 24-pixel-tall bands.
        for (int bandTop = 0; bandTop < targetH; bandTop += BAND_HEIGHT) {
            int bandBottom = Math.min(bandTop + BAND_HEIGHT, targetH);

            // ESC * m nL nH
            out.write(0x1B);
            out.write(0x2A);
            out.write(ESC_STAR_MODE);
            out.write(nL);
            out.write(nH);

            // 1. Padding columns — all-zero bytes (3 per column = 24 white pixels each).
            for (int p = 0; p < paddingLeft; p++) {
                out.write(0);
                out.write(0);
                out.write(0);
            }

            // 2. Actual image columns.
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
                out.write(b0);
                out.write(b1);
                out.write(b2);
            }

            out.write(0x0A); // LF — advances exactly BAND_HEIGHT dots
        }

        // Restore default line spacing
        out.write(0x1B); out.write(0x32);
        // Reset alignment to left
        out.write(0x1B); out.write(0x61); out.write(0x00);

        return out.toByteArray();
    }
}
