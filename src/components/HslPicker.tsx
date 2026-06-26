import { useCallback, useEffect, useRef, useState } from 'react';
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from '../lib/format';

interface Props {
  hex: string;
  onChange: (hex: string) => void;
}

export function HslPicker({ hex, onChange }: Props) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'sv' | 'hue' | null>(null);

  const svFromEvent = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = svRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    return { s: (x / rect.width) * 100, v: 100 - (y / rect.height) * 100 };
  }, []);

  const hueFromEvent = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = hueRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return (x / rect.width) * 360;
  }, []);

  const handleSvDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging('sv');
    const sv = svFromEvent(e); if (!sv) return;
    const v = sv.v / 100;
    const lightness = (v * (1 + sv.s / 100 - Math.min(v, v * (1 + sv.s / 100)) * 2)) * 100;
    const sat = v === 0 ? 0 : (2 * (1 - v)) * (sv.s / 100);
    void lightness; void sat;
    const [r, g, b] = hslToRgb(h, sv.s, lightness);
    onChange(rgbToHex(r, g, b));
  };

  const handleHueDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging('hue');
    const nh = hueFromEvent(e); if (nh == null) return;
    const [r, g, b] = hslToRgb(nh, s, l);
    onChange(rgbToHex(r, g, b));
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (dragging === 'sv') {
        const sv = svFromEvent(e); if (!sv) return;
        const v = sv.v / 100;
        const lightness = (v * (1 + sv.s / 100 - Math.min(v, v * (1 + sv.s / 100)) * 2)) * 100;
        const sat = v === 0 ? 0 : (2 * (1 - v)) * (sv.s / 100);
        void sat;
        const [r, g, b] = hslToRgb(h, sv.s, lightness);
        onChange(rgbToHex(r, g, b));
      } else {
        const nh = hueFromEvent(e); if (nh == null) return;
        const [r, g, b] = hslToRgb(nh, s, l);
        onChange(rgbToHex(r, g, b));
      }
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, h, s, l, onChange, svFromEvent, hueFromEvent]);

  // Display: convert HSL (h, s, l) to (h, sat, val) for SV square.
  // val = (l + s * min(l, 1-l)) ; sat = 2 * (1 - l/val) when val>0
  const val = l / 100 + (s / 100) * Math.min(l / 100, 1 - l / 100);
  const sat = val === 0 ? 0 : 2 * (1 - (l / 100) / val);

  const hueBg = `linear-gradient(to right,
    hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
    hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))`;
  const svBg = `linear-gradient(to top, #000, transparent),
                linear-gradient(to right, #fff, hsl(${h.toFixed(0)}, 100%, 50%))`;

  return (
    <div className="space-y-2 select-none">
      <div
        ref={svRef}
        onPointerDown={handleSvDown}
        className="relative h-40 rounded-md cursor-crosshair touch-none"
        style={{ backgroundImage: svBg }}
      >
        <div
          className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
        />
      </div>
      <div
        ref={hueRef}
        onPointerDown={handleHueDown}
        className="relative h-3 rounded-full cursor-pointer touch-none"
        style={{ backgroundImage: hueBg }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>
    </div>
  );
}