import type { Palette } from '../types';

/**
 * Hard-coded sample palettes used when the app is launched with `?demo=1`
 * (or in any non-Tauri preview environment where the Rust backend is
 * unavailable). Lets the UI be exercised without creating data on disk.
 */
export const DEMO_PALETTES: Palette[] = [
  {
    id: 'demo-1',
    name: 'VibeCoding Primary',
    description: 'Main + secondary + accent for brand & CTAs',
    colors: [
      { id: 'c1', name: 'Primary', hex: '#FF6B6B', rgb: [255, 107, 107], family: 'red', created_at: 0 },
      { id: 'c2', name: 'Secondary', hex: '#4ECDC4', rgb: [78, 205, 196], family: 'cyan', created_at: 0 },
      { id: 'c3', name: 'Accent', hex: '#FFE66D', rgb: [255, 230, 109], family: 'yellow', created_at: 0 },
      { id: 'c4', name: 'Deep', hex: '#1A535C', rgb: [26, 83, 92], family: 'blue', created_at: 0 },
      { id: 'c5', name: 'Light', hex: '#F7FFF7', rgb: [247, 255, 247], family: 'neutral', created_at: 0 },
      { id: 'c6', name: 'Ink', hex: '#2B2D42', rgb: [43, 45, 66], family: 'gray', created_at: 0 },
    ],
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 'demo-2',
    name: 'Dark mode alt',
    description: undefined,
    colors: [
      { id: 'd1', name: '', hex: '#0F1115', rgb: [15, 17, 21], family: 'gray', created_at: 0 },
      { id: 'd2', name: '', hex: '#1F2937', rgb: [31, 41, 55], family: 'gray', created_at: 0 },
      { id: 'd3', name: '', hex: '#374151', rgb: [55, 65, 81], family: 'gray', created_at: 0 },
    ],
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 'demo-3',
    name: 'Empty palette',
    description: undefined,
    colors: [],
    created_at: 0,
    updated_at: 0,
  },
];