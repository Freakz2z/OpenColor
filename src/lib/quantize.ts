export interface QuantizedColor {
  hex: string;
  rgb: [number, number, number];
  count: number;
}

/**
 * Median-cut color quantization.
 * Input: raw RGBA pixels (Uint8ClampedArray, length divisible by 4).
 * Output: top-N dominant colors, sorted by frequency.
 *
 * O(N log N) average; uses a flat-array bucket representation to keep
 * memory low for typical screenshots (~4MP → 16MB raw RGBA).
 */
export function quantizeColors(
  rgba: Uint8ClampedArray,
  count = 8,
): QuantizedColor[] {
  // Bucket pixels into a 4-bit-per-channel cube (4096 buckets) to
  // collapse noise (e.g. JPEG artefacts) before median cut.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const len = rgba.length;
  for (let i = 0; i < len; i += 4) {
    const a = rgba[i + 3];
    if (a < 128) continue;
    const r = rgba[i] & 0xf0;
    const g = rgba[i + 1] & 0xf0;
    const b = rgba[i + 2] & 0xf0;
    const key = (r << 16) | (g << 8) | b;
    const ex = buckets.get(key);
    if (ex) { ex.r += rgba[i]; ex.g += rgba[i + 1]; ex.b += rgba[i + 2]; ex.n++; }
    else buckets.set(key, { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], n: 1 });
  }

  // Convert buckets into weighted pixels for median cut.
  type Pixel = { r: number; g: number; b: number; n: number };
  let pixels: Pixel[] = [];
  for (const v of buckets.values()) {
    pixels.push({ r: v.r / v.n, g: v.g / v.n, b: v.b / v.n, n: v.n });
  }
  if (pixels.length === 0) return [];

  // Median cut: repeatedly split the largest bucket along its longest axis
  // at the median until we have `count` buckets.
  let boxes: Pixel[][] = [pixels];
  while (boxes.length < count) {
    // Pick the box with the largest total pixel count.
    let target = -1, targetCount = -1;
    for (let i = 0; i < boxes.length; i++) {
      const sum = boxes[i].reduce((s, p) => s + p.n, 0);
      if (sum > targetCount) { targetCount = sum; target = i; }
    }
    const box = boxes[target];
    if (box.length < 2) break;

    // Find channel with greatest range.
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const p of box) {
      if (p.r < rMin) rMin = p.r; if (p.r > rMax) rMax = p.r;
      if (p.g < gMin) gMin = p.g; if (p.g > gMax) gMax = p.g;
      if (p.b < bMin) bMin = p.b; if (p.b > bMax) bMax = p.b;
    }
    const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin;
    let channel: 'r' | 'g' | 'b' = 'r';
    if (gR >= rR && gR >= bR) channel = 'g';
    else if (bR >= rR && bR >= gR) channel = 'b';

    // Sort by the chosen channel and split at the weighted median.
    const sorted = box.slice().sort((a, b) => a[channel] - b[channel]);
    let total = sorted.reduce((s, p) => s + p.n, 0);
    let acc = 0, split = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
      acc += sorted[i].n;
      if (acc >= total / 2) { split = i + 1; break; }
    }
    const left = sorted.slice(0, split);
    const right = sorted.slice(split);
    if (left.length === 0 || right.length === 0) break;
    boxes = [...boxes.slice(0, target), left, right, ...boxes.slice(target + 1)];
  }

  // Compute each box's representative color (count-weighted average) and
  // total pixel count.
  const result: QuantizedColor[] = boxes
    .filter((b) => b.length > 0)
    .map((box) => {
      let rSum = 0, gSum = 0, bSum = 0, nSum = 0;
      for (const p of box) {
        rSum += p.r * p.n; gSum += p.g * p.n; bSum += p.b * p.n; nSum += p.n;
      }
      const r = Math.round(rSum / nSum);
      const g = Math.round(gSum / nSum);
      const b = Math.round(bSum / nSum);
      const count = box.reduce((s, p) => s + p.n, 0);
      return {
        hex: '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase(),
        rgb: [r, g, b] as [number, number, number],
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  return result;
}

/** Load an image File / Blob into an ImageBitmap-sized canvas, return raw RGBA. */
export async function loadImageRgba(file: File | Blob, maxDim = 256): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image decode failed'));
      i.src = url;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not available');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}