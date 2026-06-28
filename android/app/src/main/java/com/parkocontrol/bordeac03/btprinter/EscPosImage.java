package com.parkocontrol.bordeac03.btprinter;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Converts a base64-encoded PNG/JPEG into ESC/POS GS v 0 raster command bytes.
 *
 * Output layout:
 *   [ESC a n]              — alignment (0=L, 1=C, 2=R)
 *   [GS v 0 m xL xH yL yH] — raster bit-image header
 *   [raster bytes...]
 *
 * Each raster byte encodes 8 horizontal pixels (MSB = leftmost).
 * Width MUST be a multiple of 8 for ESC/POS — we round DOWN to satisfy that.
 */
final class EscPosImage {

    private EscPosImage() {}

    static byte[] rasterize(String base64, int requestedWidthDots, int alignment) throws IOException {
        byte[] decoded = Base64.decode(base64, Base64.DEFAULT);
        Bitmap src = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
        if (src == null) throw new IOException("Failed to decode image");

        // Compute target width — must be multiple of 8, clamped to printer paper.
        int targetW = Math.max(8, requestedWidthDots);
        targetW = (targetW / 8) * 8;
        // Datecs DPP-450 = 832 dots @ 200 dpi → hard ceiling.
        if (targetW > 832) targetW = 832;

        int srcW = src.getWidth();
        int srcH = src.getHeight();
        int targetH = Math.max(1, Math.round(((float) targetW / (float) srcW) * (float) srcH));
        // Guard against absurd outputs (1MB+ buffers).
        if (targetH > 4000) targetH = 4000;

        Bitmap scaled = null;
        try {
            scaled = Bitmap.createScaledBitmap(src, targetW, targetH, false);
        } finally {
            // Recycle the source only when scaling produced a NEW bitmap (createScaledBitmap may
            // return the same instance when the target dims match the source).
            if (scaled != src) {
                try { src.recycle(); } catch (Throwable ignored) {}
            }
        }
        if (scaled == null) throw new IOException("Failed to scale image");

        int widthBytes = targetW / 8;
        int xL = widthBytes & 0xFF;
        int xH = (widthBytes >> 8) & 0xFF;
        int yL = targetH & 0xFF;
        int yH = (targetH >> 8) & 0xFF;

        ByteArrayOutputStream out = new ByteArrayOutputStream(widthBytes * targetH + 32);

        // Alignment: ESC a n
        byte alignByte = (byte) (alignment == 1 ? 1 : alignment == 2 ? 2 : 0);
        out.write(0x1B);
        out.write(0x61);
        out.write(alignByte);

        // GS v 0 m xL xH yL yH
        out.write(0x1D);
        out.write(0x76);
        out.write(0x30);
        out.write(0x00); // normal mode
        out.write(xL);
        out.write(xH);
        out.write(yL);
        out.write(yH);

        // Threshold to b/w using simple luma. Simon-Says: thermal heads like dark threshold ~127.
        int[] row = new int[targetW];
        for (int y = 0; y < targetH; y++) {
            scaled.getPixels(row, 0, targetW, 0, y, targetW, 1);
            for (int xb = 0; xb < widthBytes; xb++) {
                int b = 0;
                int base = xb * 8;
                for (int bit = 0; bit < 8; bit++) {
                    int px = row[base + bit];
                    int a = Color.alpha(px);
                    int r = Color.red(px);
                    int g = Color.green(px);
                    int bl = Color.blue(px);
                    // Treat fully transparent as white.
                    int luma = (a < 32) ? 255 : (r * 30 + g * 59 + bl * 11) / 100;
                    if (luma < 128) {
                        b |= (0x80 >> bit);
                    }
                }
                out.write(b);
            }
        }

        try { scaled.recycle(); } catch (Throwable ignored) {}

        // Reset alignment to left so subsequent text isn't aligned to the image setting.
        out.write(0x1B);
        out.write(0x61);
        out.write(0x00);

        return out.toByteArray();
    }
}
