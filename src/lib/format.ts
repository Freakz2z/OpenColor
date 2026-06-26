import type { ColorFamily } from '../types';

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return [0, 0, 0];
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isValidHex(input: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(input.replace('#', ''));
}

export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return '#' + s.toUpperCase();
  if (/^[0-9A-Fa-f]{3}$/.test(s)) {
    const expanded = s.split('').map((c) => c + c).join('').toUpperCase();
    return '#' + expanded;
  }
  return null;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(h + 1 / 3) * 255),
    Math.round(hue2rgb(h) * 255),
    Math.round(hue2rgb(h - 1 / 3) * 255),
  ];
}

export function classifyFamily(hex: string): ColorFamily {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);

  if (s < 8) return 'neutral';
  if (l < 10 || l > 92) return 'neutral';
  if (s < 15 && l < 40) return 'gray';
  if (s < 20 && l >= 40 && l < 80) return 'gray';

  if (h < 15 || h >= 345) return 'red';
  if (h < 35) return 'orange';
  if (h < 55) return 'yellow';
  if (h < 80) return 'green';
  if (h < 165) return 'green';
  if (h < 195) return 'cyan';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  if (h < 345) return 'pink';
  return 'red';
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const s = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

export function textOn(hex: string): '#fff' | '#000' {
  return relativeLuminance(hex) > 0.5 ? '#000' : '#fff';
}
