import type { Palette } from '../types';

export function exportAsNaturalLanguage(palette: Palette): string {
  if (palette.colors.length === 0) {
    return `调色板 "${palette.name}" 当前为空, 请先添加颜色。`;
  }

  return palette.colors
    .map((c) => {
      const name = c.name?.trim() || c.hex;
      const rgb = `${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]}`;
      return `- ${name} ${c.hex} (RGB: ${rgb})`;
    })
    .join('\n');
}
